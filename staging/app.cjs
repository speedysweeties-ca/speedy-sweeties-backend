const express = require('express');
const { z } = require('zod');
const { createHash, timingSafeEqual } = require('node:crypto');
const catalog = require('./catalog.json');
const publishedRates = require('./published-rates.json');
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const itemSchema = z.object({product_id:z.enum(catalog.map(p => p.id)), quantity:z.number().int().min(1).max(20)}).strict();
const submissionSchema = z.object({request_key:z.string().uuid(),items:z.array(itemSchema).min(1).max(4)}).strict().superRefine((v,ctx) => {
  if (new Set(v.items.map(i=>i.product_id)).size !== v.items.length || v.items.reduce((n,i)=>n+i.quantity,0)>40) ctx.addIssue({code:'custom',message:'Invalid cart'});
});
const select = {id:true,orderNumber:true,orderStatus:true,assignedDriverId:true,createdAt:true,utmSource:true,utmMedium:true,utmContent:true,customerName:true,email:true};
const transitions = {PLACED:['DISPATCHED','CANCELLED'],DISPATCHED:['ACCEPTED','CANCELLED'],ACCEPTED:['OUT_FOR_DELIVERY','CANCELLED'],OUT_FOR_DELIVERY:['DELIVERED','CANCELLED'],DELIVERED:[],CANCELLED:[]};
const actionStatus = {dispatch:'DISPATCHED',accept:'ACCEPTED',out_for_delivery:'OUT_FOR_DELIVERY',deliver:'DELIVERED',cancel:'CANCELLED'};
async function driverState(prisma, orderId) { const row=await prisma.systemSetting.findUnique({where:{key:'chatgpt-staging-driver:'+orderId}}); return row?JSON.parse(row.value):null; }
async function publicOrder(prisma, order) { const driver=await driverState(prisma,order.id); return {environment:'isolated-staging',order_id:order.id,order_number:order.orderNumber,status:order.orderStatus,assigned_driver:!!driver || order.assignedDriverId !== null,synthetic_driver:driver?{id:driver.id,name:driver.name,role:driver.role}:null,created_at:order.createdAt,real_delivery:false,pricing_verified:false}; }
function syntheticBody(items, requestKey) {
  return {customerName:'CHATGPT STAGING TEST — DO NOT DELIVER',customerPhone:'5195550100',customerEmail:'ordering-test@example.invalid',addressLine1:'1 Synthetic Test Street',city:'Guelph',province:'Ontario',items:items.map(i=>({name:catalog.find(p=>p.id===i.product_id).name,quantity:i.quantity,unitPrice:0,totalPrice:0})),subtotal:0,deliveryFee:0,tax:0,tip:0,discount:0,total:0,paymentMethod:'CASH',orderSource:'UNKNOWN',utmSource:'chatgpt',utmMedium:'isolated-staging',utmCampaign:'ordering-prototype',utmContent:requestKey,notes:'SYNTHETIC TEST ONLY. No delivery or payment. Zero amount fields are placeholders: prices and fees are unverified.'};
}
function createApp({prisma, createOrder, validateOrder, apiKey}) {
  const app=express(); app.disable('x-powered-by');
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
  app.get('/health',async(_req,res)=>{try {await prisma.$queryRawUnsafe('SELECT 1');res.json({environment:'isolated-staging',notifications_enabled:false,auto_dispatch_enabled:false});}catch {res.status(503).json({error:'Staging database unavailable'});}});
  app.use((req,res,next)=>{const received=createHash('sha256').update(req.get('authorization')||'').digest();const expected=createHash('sha256').update('Bearer '+apiKey).digest();if(!timingSafeEqual(received,expected))return res.status(401).json({error:'Authentication required'});next();});
  app.use(express.json({limit:'8kb'}));
  app.get('/verification/:key',async(req,res,next)=>{try {const key=z.string().uuid().parse(req.params.key);const orders=await prisma.order.findMany({where:{utmContent:key,utmSource:'chatgpt',utmMedium:'isolated-staging'},select:{id:true,assignedDriverId:true,fcmToken:true,customerName:true,email:true,orderStatus:true,items:{select:{itemCatalogId:true,quantity:true}},dispatchEvents:{select:{id:true}}}});const schema=await prisma.$queryRawUnsafe('SELECT current_schema() AS schema');const drivers=await Promise.all(orders.map(o=>driverState(prisma,o.id)));res.json({environment:'isolated-staging',database_schema:schema[0]?.schema,request_order_count:orders.length,staff_driver_accounts:await prisma.user.count(),assigned_drivers:orders.filter(o=>o.assignedDriverId).length,synthetic_driver_assignments:drivers.filter(Boolean).length,notification_tokens:orders.filter(o=>o.fcmToken).length,dispatch_events:orders.reduce((n,o)=>n+o.dispatchEvents.length,0),statuses:orders.map(o=>o.orderStatus),all_customers_synthetic:orders.every(o=>o.customerName==='CHATGPT STAGING TEST — DO NOT DELIVER'&&o.email==='ordering-test@example.invalid'),all_items_allowlisted:orders.every(o=>o.items.every(i=>catalog.some(p=>p.id===i.itemCatalogId)))});}catch(e){next(e);}});
  app.get('/catalog',(_req,res)=>res.json({environment:'isolated-staging',catalogue_snapshot_date:'2026-10-01',items:catalog,pricing_verified:false,stock_checked:false,delivery_fee:null,total:null,published_rates:publishedRates}));
  app.get('/orders/:key',async(req,res,next)=>{try {const key=z.string().uuid().parse(req.params.key);const record=await prisma.systemSetting.findUnique({where:{key:'chatgpt-staging:'+key}});if(!record)return res.status(404).json({error:'Test request not found'});const data=JSON.parse(record.value);if(data.state!=='complete')return res.status(409).json({error:'Submission requires reconciliation; do not create a new request',state:data.state});const order=await prisma.order.findUnique({where:{id:data.orderId},select});if(!order)return res.status(404).json({error:'Test order not found'});res.json(await publicOrder(prisma,order));}catch(e){next(e);}});
  app.post('/orders',async(req,res,next)=>{try {
    const data=submissionSchema.parse(req.body);data.items.sort((a,b)=>a.product_id.localeCompare(b.product_id));const hash=fingerprint(JSON.stringify(data.items));const key='chatgpt-staging:'+data.request_key;
    // Reserve before the real controller writes. Never re-submit an uncertain attempt.
    try {await prisma.systemSetting.create({data:{key,value:JSON.stringify({state:'pending',hash})}});} catch(e) {
      if(e.code!=='P2002')throw e;
      const previous=JSON.parse((await prisma.systemSetting.findUnique({where:{key}})).value);
      if(previous.hash!==hash)return res.status(409).json({error:'Request key belongs to a different cart'});
      if(previous.state!=='complete')return res.status(409).json({error:'Submission pending or uncertain; do not create a new request'});
      const order=await prisma.order.findUnique({where:{id:previous.orderId},select});if(!order)return res.status(409).json({error:'Stored submission requires reconciliation'});
      return res.json(await publicOrder(prisma,order));
    }
    let status=200,payload;
    const body=validateOrder({body:syntheticBody(data.items,data.request_key)}).body;
    await createOrder({body,headers:{}},{status(code){status=code;return this;},json(value){payload=value;return this;}});
    if(status!==201 || !payload?.order?.id)throw new Error('Backend did not confirm creation');
    await prisma.systemSetting.update({where:{key},data:{value:JSON.stringify({state:'complete',hash,orderId:payload.order.id})}});
    res.status(201).json(await publicOrder(prisma,payload.order));
  } catch(e){next(e);}});
  app.post('/orders/:key/simulate',async(req,res,next)=>{try {
    const key=z.string().uuid().parse(req.params.key);
    const {action}=z.object({action:z.enum(['dispatch','accept','out_for_delivery','deliver','cancel'])}).strict().parse(req.body);
    const reservation=await prisma.systemSetting.findUnique({where:{key:'chatgpt-staging:'+key}});
    if(!reservation)return res.status(404).json({error:'Test request not found'});
    const saved=JSON.parse(reservation.value);
    if(saved.state!=='complete')return res.status(409).json({error:'Only a completed test order can enter the simulator'});
    const result=await prisma.$transaction(async tx=>{
      // Lock the one staging order so concurrent clicks cannot overwrite later states.
      await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE',saved.orderId);
      const order=await tx.order.findUnique({where:{id:saved.orderId},select});
      if(!order || order.utmContent!==key || order.utmSource!=='chatgpt' || order.utmMedium!=='isolated-staging' || order.customerName!=='CHATGPT STAGING TEST — DO NOT DELIVER' || order.email!=='ordering-test@example.invalid' || order.assignedDriverId!==null)return {code:404,error:'Synthetic test order not found'};
      const target=actionStatus[action];
      if(order.orderStatus===target)return {code:200,body:await publicOrder(tx,order)};
      if(!transitions[order.orderStatus]?.includes(target))return {code:409,error:`Cannot move ${order.orderStatus} to ${target}. Check the current test status.`};
      const now=new Date(),data={orderStatus:target};
      if(action==='dispatch')data.dispatchedAt=now;
      if(action==='accept')data.acceptedAt=now;
      if(action==='out_for_delivery')data.outForDeliveryAt=now;
      if(action==='deliver')data.deliveredAt=now;
      if(action==='cancel'){data.cancelledAt=now;data.cancelledFromStatus=order.orderStatus;data.cancellationReason='Synthetic staging simulation';}
      const updated=await tx.order.update({where:{id:order.id},data,select});
      if(action==='dispatch'){
        const driver={id:'staging-driver-1',name:'Synthetic Driver',role:'DRIVER'};
        await tx.systemSetting.upsert({where:{key:'chatgpt-staging-driver:'+order.id},create:{key:'chatgpt-staging-driver:'+order.id,value:JSON.stringify(driver)},update:{value:JSON.stringify(driver)}});
      }
      return {code:200,body:await publicOrder(tx,updated)};
    });
    res.status(result.code).json(result.body||{error:result.error});
  }catch(e){next(e);}});
  app.use((_req,res)=>res.status(404).json({error:'Unknown staging endpoint'}));
  app.use((err,_req,res,_next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:'Only the four allowlisted products and quantities are accepted. No personal details or notes.'});console.error('Staging request failed',err.name);res.status(503).json({error:'Staging submission could not be confirmed. Keep the same request key; do not create another order.'});});
  return app;
}
module.exports={createApp,submissionSchema,syntheticBody};
