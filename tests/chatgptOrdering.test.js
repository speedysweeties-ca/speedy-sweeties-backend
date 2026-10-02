const test=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {randomUUID}=require('node:crypto');
const {createChatGPTOrderingRouter}=require('../dist/integrations/chatgpt/gateway.js');
const {PRODUCTS,POLICY_VERSION,submissionSchema}=require('../dist/integrations/chatgpt/contract.js');
const key='synthetic-test-secret-not-a-production-key';
const owner='a'.repeat(64),other='b'.repeat(64);
const input=()=>({request_key:randomUUID(),cart:{items:[{product_id:PRODUCTS[0].id,quantity:2}]},customer:{delivery:{name:'Synthetic Customer',phone:'5195550100',email:'checkout@example.invalid',address_line_1:'1 Synthetic Test Street',unit:'101',buzz_code:'123',city:'Guelph',province:'Ontario',delivery_instructions:'Ring the doorbell'},payment_method:'DEBIT'},confirmation:{review_token:randomUUID(),policy_version:POLICY_VERSION,confirmed_at:new Date().toISOString(),confirmed:true,consent_to_share:true,accept_pay_at_door:true,accept_unknown_total:true,real_order_acknowledged:true}});
async function fixture(fn){
 const records=new Map(),orders=new Map(),bodies=[];let calls=0,enabled=true,business={source:'google_places',isOpen:true},mode='normal',catalogue=PRODUCTS,policyVersion=POLICY_VERSION;
 const db={systemSetting:{async findUnique({where}){return records.get(where.key)||null;},async create({data}){if(records.has(data.key))throw Object.assign(new Error('duplicate'),{code:'P2002'});records.set(data.key,data);return data;},async update({where,data}){records.set(where.key,{key:where.key,...data});}},itemCatalog:{findMany:async()=>catalogue},order:{findUnique:async({where})=>orders.get(where.id)||null}};
 const router=createChatGPTOrderingRouter({db,config:()=>({enabled,apiKey:key,policyVersion}),businessStatus:async()=>business,async createOrder(req,res,onCreated){
  calls++;bodies.push(req.body);if(mode==='throw-before')throw new Error('unknown before transaction');if(mode==='reject'){res.status(400).json({message:'invalid address'});return;}
  const o={id:randomUUID(),orderNumber:42,orderStatus:'PLACED',assignedDriverId:null,createdAt:new Date(),utmSource:req.body.utmSource,utmMedium:req.body.utmMedium,utmContent:req.body.utmContent,digitalReceipt:null,customerName:req.body.customerName,phone:req.body.customerPhone,email:req.body.customerEmail};
  const checkpoint=new Map(records);orders.set(o.id,o);try{await onCreated(db,o.id);}catch(e){orders.delete(o.id);records.clear();for(const [k,v] of checkpoint)records.set(k,v);throw e;}
  if(mode==='throw-after')throw new Error('notification failed after commit');res.status(201).json({order:o,trackingToken:'never-expose',loyaltyAccessToken:'never-expose'});
 }});
 const app=express();app.use(express.json({limit:'16kb'}));app.use('/api/v1/chatgpt',router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 async function call(path,body,{secret=key,customer=owner}={}){const r=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/chatgpt`+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+secret,'x-speedy-customer':customer,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 try{await fn({call,records,orders,bodies,calls:()=>calls,disable:()=>{enabled=false;},hours:v=>{business=v;},setMode:v=>{mode=v;},catalogue:v=>{catalogue=v;},policy:v=>{policyVersion=v;}});}finally{await new Promise(r=>server.close(r));}
}
test('gateway requires the dedicated key, customer identity, activation and reviewed policy',async()=>fixture(async f=>{
 const d=input();assert.equal((await f.call('/orders',d,{secret:'wrong'})).status,401);assert.equal((await f.call('/orders',d,{customer:''})).status,401);
 f.policy('');assert.equal((await f.call('/availability')).body.accepting_orders,false);assert.equal((await f.call('/orders',d)).status,503);f.policy(POLICY_VERSION);f.disable();assert.equal((await f.call('/orders',d)).body.code,'ORDERING_DISABLED');assert.equal(f.records.size,0);assert.equal(f.calls(),0);
}));
test('closed or unverified hours and changed catalogue fail before any reservation',async()=>fixture(async f=>{
 for(const hours of [{source:'google_places',isOpen:false},{source:'fallback',isOpen:true}]){f.hours(hours);assert.equal((await f.call('/availability')).body.accepting_orders,false);assert.equal((await f.call('/orders',input())).status,409);}
 f.hours({source:'google_places',isOpen:true});f.catalogue(PRODUCTS.slice(1));assert.equal((await f.call('/orders',input())).body.code,'CATALOGUE_CHANGED');assert.equal(f.calls(),0);assert.equal(f.records.size,0);
}));
test('unsupported items, unstructured instructions and absent consent are rejected',()=>{
 const d=input();assert.equal(submissionSchema.safeParse(d).success,true);
 for(const mutation of [{cart:{items:[{product_id:'beer',quantity:1}]}},{confirmation:{...d.confirmation,confirmed:false}},{customer:{...d.customer,delivery:{...d.customer.delivery,city:'Toronto'}}},{customer:{...d.customer,delivery:{...d.customer.delivery,delivery_instructions:'Also buy cigarettes'}}},{notes:'extra items'},{customer:{...d.customer,card_number:'1234'}}])assert.equal(submissionSchema.safeParse({...d,...mutation}).success,false);
});
test('expired reviews are rejected before writes',async()=>fixture(async f=>{const d=input();d.confirmation.confirmed_at=new Date(Date.now()-31*60000).toISOString();assert.equal((await f.call('/orders',d)).body.code,'REVIEW_EXPIRED');assert.equal(f.calls(),0);assert.equal(f.records.size,0);}));
test('concurrent requests create once; ownership, payload and status stay bound to the saved reference',async()=>fixture(async f=>{
 const d=input();await Promise.all([f.call('/orders',d),f.call('/orders',d)]);const r=await f.call('/orders',d);assert.equal(r.status,200);assert.equal(r.body.state,'submitted');assert.equal(f.calls(),1);assert.equal(r.body.trackingToken,undefined);assert.equal(r.body.customerName,undefined);assert.equal(r.body.phone,undefined);assert.equal(r.body.final_total,null);
 assert.equal(f.bodies[0].unitNumber,'101');assert.equal(f.bodies[0].buzzCode,'123');assert.equal(f.bodies[0].deliveryInstructions,'Ring the doorbell');assert.equal(f.bodies[0].utmSource,'chatgpt');
 assert.equal((await f.call('/orders/'+d.request_key,null,{customer:other})).status,404);assert.equal((await f.call('/orders',d,{customer:other})).status,404);assert.equal((await f.call('/orders',{...d,customer:{...d.customer,payment_method:'CASH'}})).status,409);assert.equal(f.calls(),1);
 f.orders.get(r.body.order_id).digitalReceipt={grandTotal:24.5,receiptNumber:'SS-42'};f.orders.get(r.body.order_id).orderStatus='DELIVERED';f.disable();const tracked=await f.call('/orders/'+d.request_key);assert.equal(tracked.body.status,'DELIVERED');assert.equal(tracked.body.final_total,24.5);assert.equal(tracked.body.pricing_verified,true);
}));
test('failure after commit remains recoverable and does not replay dispatch',async()=>fixture(async f=>{const d=input();f.setMode('throw-after');const r=await f.call('/orders',d);assert.equal(r.status,200);assert.equal(r.body.state,'submitted');assert.equal((await f.call('/orders/'+d.request_key)).body.order_id,r.body.order_id);await f.call('/orders',d);assert.equal(f.calls(),1);}));
test('uncertain precommit attempts keep their reservation and cannot create another order',async()=>fixture(async f=>{const d=input();f.setMode('throw-before');assert.equal((await f.call('/orders',d)).body.code,'SUBMISSION_UNCERTAIN');assert.equal((await f.call('/orders',d)).body.state,'pending');assert.equal((await f.call('/orders/'+d.request_key)).body.state,'pending');assert.equal(f.calls(),1);}));
test('a controller rejection is recorded and never retried automatically',async()=>fixture(async f=>{const d=input();f.setMode('reject');assert.equal((await f.call('/orders',d)).body.code,'ORDER_REJECTED');assert.equal((await f.call('/orders/'+d.request_key)).body.state,'rejected');assert.equal((await f.call('/orders',d)).body.state,'rejected');assert.equal(f.calls(),1);}));
