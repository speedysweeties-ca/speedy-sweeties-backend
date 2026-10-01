const test=require('node:test'),assert=require('node:assert/strict');
const express=require('express'),jwt=require('jsonwebtoken'),bcrypt=require('bcrypt');
const {createStaffAccess,permittedPassword}=require('./staff-access.cjs');
const {createStaffApi}=require('./staff-api.cjs');
const {accounts,PASSWORD_DISABLED}=require('./workflow.cjs');
test('temporary test credentials expire, rotate and bind sessions to one fixed account',async()=>{
 const users=accounts.map(a=>({...a,passwordHash:PASSWORD_DISABLED})),rows=new Map();
 const prisma={user:{update:async({where,data})=>Object.assign(users.find(u=>u.id===where.id),data)},systemSetting:{findUnique:async({where})=>rows.get(where.key),upsert:async({where,create})=>rows.set(where.key,create)}};
 prisma.$transaction=async fn=>fn(prisma);
 const secret='test-jwt-secret'.repeat(4);let credential,status=200,result;
 const response={status(n){status=n;return this;},json(v){result=v;return this;}};
 const access=createStaffAccess({prisma,accounts,assertAccounts:async()=>{},hashPassword:p=>bcrypt.hash(p,4),jwt,jwtSecret:secret,loginController:async(req,res)=>{const user=users.find(u=>u.email===req.body.email);res.status(await bcrypt.compare(req.body.password,user.passwordHash)?200:401).json({token:'real-login-controller-token'});}});
 await access.issue({body:{role:'DRIVER'}},response);credential=result;
 assert.equal(credential.email,'driver@example.invalid');assert.equal(credential.password.length,32);
 assert.equal(await permittedPassword(prisma,users[1],PASSWORD_DISABLED),true);
 await access.login({body:{email:credential.email,password:'wrong'}},response);assert.equal(status,401);
 status=200;await access.login({body:{email:credential.email,password:credential.password}},response);assert.equal(status,200);
 const payload=jwt.verify(result.token,secret);assert.equal(payload.role,'DRIVER');assert.ok(payload.exp-payload.iat<=7200);
 let next=0;await access.session({user:payload},response,()=>next++);assert.equal(next,1);
 await access.issue({body:{role:'DRIVER'}},response);await access.session({user:payload},response,()=>next++);assert.equal(status,401);assert.equal(next,1);
 const row=rows.get('chatgpt-staging-staff:staging-driver-1');const grant=JSON.parse(row.value);grant.expiresAt=Date.now()-1;row.value=JSON.stringify(grant);
 await access.login({body:{email:credential.email,password:credential.password}},response);assert.equal(status,401);
 await assert.rejects(access.issue({body:{role:'ADMIN'}},response));
});
test('staff routes enforce roles and reject GPS, push tokens, arbitrary accounts and registration',async()=>{
 let writes=0;
 const reject=(_req,res)=>res.json({success:true});
 const router=createStaffApi({prisma:{},access:{login:reject,session:(_req,_res,next)=>next()},requireAuth:(req,res,next)=>{if(!req.get('authorization'))return res.status(401).json({});req.user={role:req.get('authorization')};next();},requireRole:roles=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({}),controllers:{heartbeat:(_req,res)=>{writes++;res.json({success:true});},orders:reject,driverOrders:reject,profile:reject,drivers:reject,online:reject,offline:reject,assign:reject,priority:reject,cancel:reject,driverAction:reject,receipt:reject,getReceipt:reject}});
 const app=express();app.use(express.json(),router);app.use((_e,_req,res,_next)=>res.status(400).json({}));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 async function call(path,method,body,role='DRIVER'){const r=await fetch(`http://127.0.0.1:${server.address().port}`+path,{method,headers:{Authorization:role,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return r.status;}
 try{
  assert.equal(await call('/orders','GET',null,'DRIVER'),403);assert.equal(await call('/driver/orders','GET',null,'DISPATCHER'),403);
  for(const body of [{latitude:43,longitude:-80},{driverFcmToken:'real-token'},{appState:'FOREGROUND',locationTimestampMs:1}])assert.equal(await call('/driver/heartbeat','POST',body),400);
  assert.equal(await call('/driver/heartbeat','POST',{appState:'FOREGROUND'}),200);assert.equal(writes,1);
  assert.equal(await call('/driver/offline','POST',null),200);
  assert.equal(await call('/driver/online','POST',null),200);
  assert.equal(await call('/driver/offline','POST',{latitude:43}),400);
  assert.equal(await call('/auth/register','POST',{email:'someone@example.com'}),404);
  assert.equal(await call('/orders/123/assign-driver','PATCH',{driverId:'real-driver'},'DISPATCHER'),400);
 }finally{await new Promise(r=>server.close(r));}
});
