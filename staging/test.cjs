const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {assertStaging,DATABASE_ID}=require('./guard.cjs');
const {isolatedDatabaseUrl,STAGING_SCHEMA}=require('./schema.cjs');
const {createApp,submissionSchema,syntheticBody}=require('./app.cjs');
const catalog=require('./catalog.json');
const safe={NODE_ENV:'test',SPEEDY_ORDERING_MODE:'isolated-staging',AUTO_DISPATCH_ENABLED:'false',FIREBASE_SERVICE_ACCOUNT_JSON:'{}',STAGING_API_KEY:'s'.repeat(40),JWT_SECRET:'j'.repeat(40),DATABASE_URL:`postgresql://speedy_ordering_staging_db_user:test@${DATABASE_ID}/speedy_ordering_staging_db`};
test('schema preparation targets only the new namespace in the pinned test database',()=>{const url=new URL(isolatedDatabaseUrl(safe));assert.equal(url.hostname,DATABASE_ID);assert.equal(url.pathname,'/speedy_ordering_staging_db');assert.equal(url.searchParams.get('schema'),STAGING_SCHEMA);assert.equal(new URL(safe.DATABASE_URL).searchParams.has('schema'),false);assert.throws(()=>isolatedDatabaseUrl({...safe,DATABASE_URL:'postgresql://user:pass@production/live'}));});
test('guard rejects production databases, dispatch, provider credentials and wrong runtime',()=>{assert.equal(assertStaging(safe),true);for(const changes of [{NODE_ENV:'production'},{AUTO_DISPATCH_ENABLED:'true'},{GOOGLE_GEOCODING_API_KEY:'key'},{RESEND_API_KEY:'key'},{FIREBASE_SERVICE_ACCOUNT_JSON:'{"project_id":"live"}'},{DATABASE_URL:'postgresql://user:pass@dpg-d7m33g2qqhas73f58hrg-a/speedy_sweeties_db'},{DATABASE_URL:safe.DATABASE_URL+'?schema=production'},{STAGING_API_KEY:'short'}])assert.throws(()=>assertStaging({...safe,...changes}));});
test('only explicit product IDs accepted; no personal data, notes, duplicates or excess quantities',()=>{const input={request_key:randomUUID(),items:[{product_id:catalog[0].id,quantity:1}]};assert.equal(submissionSchema.safeParse(input).success,true);for(const extra of [{notes:'extra items'},{customerPhone:'1234567890'},{items:[{product_id:'beer',quantity:1}]},{items:[input.items[0],input.items[0]]},{items:[{product_id:catalog[0].id,quantity:21}]}])assert.equal(submissionSchema.safeParse({...input,...extra}).success,false);const body=syntheticBody(input.items,input.request_key);assert.equal(body.customerEmail,'ordering-test@example.invalid');assert.match(body.notes,/placeholders/);assert.equal(body.utmSource,'chatgpt');});
async function fixture(fn,{fail=false}={}){
 const records=new Map(),orders=new Map();let calls=0;
 const prisma={$queryRawUnsafe:async()=>1,systemSetting:{async create({data}){if(records.has(data.key))throw Object.assign(new Error(),{code:'P2002'});records.set(data.key,data);return data;},async findUnique({where}){return records.get(where.key)||null;},async update({where,data}){records.set(where.key,{key:where.key,...data});},async upsert({where,create,update}){records.set(where.key,{key:where.key,...(records.get(where.key)||create),...update});}},order:{async findUnique({where}){return orders.get(where.id)||null;},async update({where,data}){const next={...orders.get(where.id),...data};orders.set(where.id,next);return next;}}};
 // Serial transaction adapter with rollback for the simulator's atomic writes.
 let queue=Promise.resolve();
 prisma.$transaction=fn=>{const work=queue.then(async()=>{const recordSnapshot=new Map(records),orderSnapshot=new Map(orders);try{return await fn(prisma);}catch(e){records.clear();orders.clear();for(const [k,v] of recordSnapshot)records.set(k,v);for(const [k,v] of orderSnapshot)orders.set(k,v);throw e;}});queue=work.catch(()=>{});return work;};
 const app=createApp({prisma,apiKey:safe.STAGING_API_KEY,validateOrder:x=>x,async createOrder(req,res){calls++;assert.equal(req.body.customerEmail,'ordering-test@example.invalid');if(fail)throw new Error('ambiguous network result');const order={id:randomUUID(),orderNumber:1,orderStatus:'PLACED',assignedDriverId:null,createdAt:new Date().toISOString(),utmSource:'chatgpt',utmMedium:'isolated-staging',utmContent:req.body.utmContent,customerName:'CHATGPT STAGING TEST — DO NOT DELIVER',email:'ordering-test@example.invalid'};orders.set(order.id,order);res.status(201).json({order,trackingToken:'must-not-leak',loyaltyAccessToken:'must-not-leak'});}});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}`;
 async function call(path,body,key=safe.STAGING_API_KEY){const r=await fetch(url+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+key,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 try{await fn({call,calls:()=>calls,records,orders});}finally{await new Promise(r=>server.close(r));}
}
test('authorization and validation happen before any write',async()=>fixture(async({call,calls,records})=>{const input={request_key:randomUUID(),items:[{product_id:catalog[0].id,quantity:1}]};assert.equal((await call('/orders',input,'bad')).status,401);assert.equal((await call('/orders',{...input,notes:'hidden'})).status,400);assert.equal(records.size,0);assert.equal(calls(),0);assert.equal((await call('/api/v1/orders',input)).status,404);}));
test('durable request key deduplicates concurrent requests and never exposes backend credentials',async()=>fixture(async({call,calls})=>{const input={request_key:randomUUID(),items:[{product_id:catalog[0].id,quantity:1}]};await Promise.all([call('/orders',input),call('/orders',input)]);const retry=await call('/orders',input);assert.equal(retry.status,200);assert.equal(calls(),1);assert.equal(retry.body.status,'PLACED');assert.equal(retry.body.real_delivery,false);assert.equal(retry.body.trackingToken,undefined);assert.equal((await call('/orders',{...input,items:[{product_id:catalog[1].id,quantity:1}]})).status,409);assert.equal((await call('/orders/'+input.request_key)).body.order_id,retry.body.order_id);}));
test('uncertain results keep their reservation and cannot silently submit a second order',async()=>fixture(async({call,calls})=>{const input={request_key:randomUUID(),items:[{product_id:catalog[0].id,quantity:1}]};assert.equal((await call('/orders',input)).status,503);assert.equal((await call('/orders',input)).status,409);assert.equal((await call('/orders/'+input.request_key)).status,409);assert.equal(calls(),1);},{fail:true}));
test('synthetic dispatcher and driver simulation follows the guarded lifecycle',async()=>fixture(async({call})=>{const input={request_key:randomUUID(),items:[{product_id:catalog[0].id,quantity:1}]};const created=await call('/orders',input);assert.equal(created.status,201);for(const [action,status] of [['dispatch','DISPATCHED'],['accept','ACCEPTED'],['out_for_delivery','OUT_FOR_DELIVERY'],['deliver','DELIVERED']]){const r=await call('/orders/'+input.request_key+'/simulate',{action});assert.equal(r.status,200);assert.equal(r.body.status,status);if(action==='dispatch')assert.equal(r.body.assigned_driver,true);}assert.equal((await call('/orders/'+input.request_key+'/simulate',{action:'dispatch'})).status,409);const final=await call('/orders/'+input.request_key);assert.equal(final.body.status,'DELIVERED');assert.equal(final.body.real_delivery,false);},{}));

test('simulator rejects skips, cross-key mapping, extra fields and real contact details',async()=>fixture(async({call,orders})=>{
 const key=randomUUID(),input={request_key:key,items:[{product_id:catalog[0].id,quantity:1}]};
 const created=await call('/orders',input),path='/orders/'+key+'/simulate';
 assert.equal((await call(path,{action:'deliver'})).status,409);
 assert.equal((await call(path,{action:'dispatch',driver_id:'any'})).status,400);
 assert.equal((await call(path,{action:'dispatch'},'bad')).status,401);
 const order=orders.get(created.body.order_id);order.email='real@example.com';
 assert.equal((await call(path,{action:'dispatch'})).status,404);
 order.email='ordering-test@example.invalid';order.utmContent=randomUUID();
 assert.equal((await call(path,{action:'dispatch'})).status,404);
 assert.equal(order.orderStatus,'PLACED');
}));
test('duplicate concurrent simulation steps are idempotent and cannot move a later status backward',async()=>fixture(async({call,orders,records})=>{
 const key=randomUUID();const created=await call('/orders',{request_key:key,items:[{product_id:catalog[0].id,quantity:1}]});
 const path='/orders/'+key+'/simulate';const repeated=await Promise.all([call(path,{action:'dispatch'}),call(path,{action:'dispatch'})]);
 assert.deepEqual(repeated.map(r=>r.status),[200,200]);
 const first=orders.get(created.body.order_id).dispatchedAt;
 assert.equal([...records.keys()].filter(k=>k.startsWith('chatgpt-staging-driver:')).length,1);
 assert.equal((await call(path,{action:'accept'})).body.status,'ACCEPTED');
 assert.equal((await call(path,{action:'dispatch'})).status,409);
 assert.equal(orders.get(created.body.order_id).dispatchedAt,first);
 assert.equal((await call('/orders/'+key)).body.status,'ACCEPTED');
}));
