const express = require('express');
const { z } = require('zod');
const { createHash, timingSafeEqual } = require('node:crypto');
const catalog = require('./catalog.json');
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const itemSchema = z.object({product_id:z.enum(catalog.map(p => p.id)), quantity:z.number().int().min(1).max(20)}).strict();
const submissionSchema = z.object({request_key:z.string().uuid(),items:z.array(itemSchema).min(1).max(4)}).strict().superRefine((v,ctx) => {
  if (new Set(v.items.map(i=>i.product_id)).size !== v.items.length || v.items.reduce((n,i)=>n+i.quantity,0)>40) ctx.addIssue({code:'custom',message:'Invalid cart'});
});
const select = {id:true,orderNumber:true,orderStatus:true,assignedDriverId:true,createdAt:true};
const publicOrder = order => ({environment:'isolated-staging',order_id:order.id,order_number:order.orderNumber,status:order.orderStatus,assigned_driver:order.assignedDriverId !== null,created_at:order.createdAt,real_delivery:false,pricing_verified:false});
function syntheticBody(items, requestKey) {
  return {customerName:'CHATGPT STAGING TEST — DO NOT DELIVER',customerPhone:'5195550100',customerEmail:'ordering-test@example.invalid',addressLine1:'1 Synthetic Test Street',city:'Guelph',province:'Ontario',items:items.map(i=>({name:catalog.find(p=>p.id===i.product_id).name,quantity:i.quantity,unitPrice:0,totalPrice:0})),subtotal:0,deliveryFee:0,tax:0,tip:0,discount:0,total:0,paymentMethod:'CASH',orderSource:'UNKNOWN',utmSource:'chatgpt',utmMedium:'isolated-staging',utmCampaign:'ordering-prototype',utmContent:requestKey,notes:'SYNTHETIC TEST ONLY. No delivery or payment. Zero amount fields are placeholders: prices and fees are unverified.'};
}
function createApp({prisma, createOrder, validateOrder, apiKey}) {
  const app=express(); app.disable('x-powered-by');
  app.use((_req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');next();});
  app.get('/health',async(_req,res)=>{try {await prisma.$queryRawUnsafe('SELECT 1');res.json({environment:'isolated-staging',notifications_enabled:false,auto_dispatch_enabled:false});}catch {res.status(503).json({error:'Staging database unavailable'});}});
  app.use((req,res,next)=>{const received=createHash('sha256').update(req.get('authorization')||'').digest();const expected=createHash('sha256').update('Bearer '+apiKey).digest();if(!timingSafeEqual(received,expected))return res.status(401).json({error:'Authentication required'});next();});
  app.use(express.json({limit:'8kb'}));
  app.get('/catalog',(_req,res)=>res.json({environment:'isolated-staging',catalogue_snapshot_date:'2026-10-01',items:catalog,pricing_verified:false,stock_checked:false,delivery_fee:null,total:null}));
  app.get('/orders/:key',async(req,res,next)=>{try {const key=z.string().uuid().parse(req.params.key);const record=await prisma.systemSetting.findUnique({where:{key:'chatgpt-staging:'+key}});if(!record)return res.status(404).json({error:'Test request not found'});const data=JSON.parse(record.value);if(data.state!=='complete')return res.status(409).json({error:'Submission requires reconciliation; do not create a new request',state:data.state});const order=await prisma.order.findUnique({where:{id:data.orderId},select});if(!order)return res.status(404).json({error:'Test order not found'});res.json(publicOrder(order));}catch(e){next(e);}});
  app.post('/orders',async(req,res,next)=>{try {
    const data=submissionSchema.parse(req.body);data.items.sort((a,b)=>a.product_id.localeCompare(b.product_id));const hash=fingerprint(JSON.stringify(data.items));const key='chatgpt-staging:'+data.request_key;
    // Reserve before the real controller writes. Never re-submit an uncertain attempt.
    try {await prisma.systemSetting.create({data:{key,value:JSON.stringify({state:'pending',hash})}});} catch(e) {
      if(e.code!=='P2002')throw e;
      const previous=JSON.parse((await prisma.systemSetting.findUnique({where:{key}})).value);
      if(previous.hash!==hash)return res.status(409).json({error:'Request key belongs to a different cart'});
      if(previous.state!=='complete')return res.status(409).json({error:'Submission pending or uncertain; do not create a new request'});
      const order=await prisma.order.findUnique({where:{id:previous.orderId},select});if(!order)return res.status(409).json({error:'Stored submission requires reconciliation'});
      return res.json(publicOrder(order));
    }
    let status=200,payload;
    const body=validateOrder({body:syntheticBody(data.items,data.request_key)}).body;
    await createOrder({body,headers:{}},{status(code){status=code;return this;},json(value){payload=value;return this;}});
    if(status!==201 || !payload?.order?.id)throw new Error('Backend did not confirm creation');
    await prisma.systemSetting.update({where:{key},data:{value:JSON.stringify({state:'complete',hash,orderId:payload.order.id})}});
    res.status(201).json(publicOrder(payload.order));
  } catch(e){next(e);}});
  app.use((_req,res)=>res.status(404).json({error:'Unknown staging endpoint'}));
  app.use((err,_req,res,_next)=>{if(err instanceof z.ZodError)return res.status(400).json({error:'Only the four allowlisted products and quantities are accepted. No personal details or notes.'});console.error('Staging request failed',err.name);res.status(503).json({error:'Staging submission could not be confirmed. Keep the same request key; do not create another order.'});});
  return app;
}
module.exports={createApp,submissionSchema,syntheticBody};
