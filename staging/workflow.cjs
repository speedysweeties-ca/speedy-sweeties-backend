// Test-only adapter around the unchanged application controllers. No login API.
const { z } = require('zod');
const catalog = require('./catalog.json');
const WORKFLOW = 'controller-test-v1';
const PASSWORD_DISABLED = '!STAGING_LOGIN_DISABLED!';
const accounts = [
  {id:'staging-dispatcher-1',email:'dispatcher@example.invalid',role:'DISPATCHER',firstName:'Synthetic',lastName:'Dispatcher'},
  {id:'staging-driver-1',email:'driver@example.invalid',role:'DRIVER',firstName:'Synthetic',lastName:'Driver'},
];
const actionSchema = z.object({action:z.enum(['dispatch','accept','out_for_delivery','deliver','cancel'])}).strict();
const targetStatus = {dispatch:'DISPATCHED',accept:'ACCEPTED',out_for_delivery:'OUT_FOR_DELIVERY',deliver:'DELIVERED',cancel:'CANCELLED'};
const fromStatus = {dispatch:['PLACED'],accept:['DISPATCHED'],out_for_delivery:['ACCEPTED'],deliver:['OUT_FOR_DELIVERY'],cancel:['PLACED','DISPATCHED','ACCEPTED','OUT_FOR_DELIVERY']};
async function assertAccounts(prisma, allowMissing=false) {
  const users = await prisma.user.findMany();
  if ((!allowMissing && users.length!==accounts.length) || users.some(user=>{
    const expected=accounts.find(a=>a.id===user.id);
    return !expected || Object.entries(expected).some(([key,value])=>user[key]!==value) || user.passwordHash!==PASSWORD_DISABLED || user.driverFcmToken!==null || user.latitude!==null || user.longitude!==null;
  })) throw new Error('Only the fixed synthetic staff identities are allowed in staging');
}
async function prepareAccounts(prisma) {
  await assertAccounts(prisma,true);
  for(const account of accounts) await prisma.user.upsert({where:{id:account.id},create:{...account,passwordHash:PASSWORD_DISABLED,isActive:true,isVisibleInDispatch:true},update:{}});
  await assertAccounts(prisma);
}
function isSynthetic(order,key) {
  return order && order.utmContent===key && order.utmSource==='chatgpt' && order.utmMedium==='isolated-staging'
    && order.customerName==='CHATGPT STAGING TEST — DO NOT DELIVER' && order.email==='ordering-test@example.invalid'
    && order.phone==='5195550100' && order.addressLine1==='1 Synthetic Test Street'
    && order.fcmToken===null && (order.assignedDriverId===null || order.assignedDriverId==='staging-driver-1')
    && order.items.length>0 && order.items.every(i=>catalog.some(p=>p.id===i.itemCatalogId)&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=20);
}
function receiptFixture(order) {
  const itemTotal=order.items.reduce((n,item)=>n+item.quantity,0);
  return {itemTotal,deliveryCharge:2,taxOrFees:0.5,grandTotal:itemTotal+2.5,notes:'SYNTHETIC TEST RECEIPT. Fictional $1 per unit, $2 delivery and $0.50 fees. Not prices, tax advice, an amount due, or a payment.'};
}
async function invoke(controller,req) {
  let status=200,payload;
  await controller(req,{status(code){status=code;return this;},json(value){payload=value;return this;}});
  return {status,payload};
}
function createWorkflow({prisma,assignDriver,driverAction,saveReceipt,cancelOrder}) {
  return async function run(key,orderId,raw) {
    const {action}=actionSchema.parse(raw),lockKey='chatgpt-staging-action:'+orderId;
    await assertAccounts(prisma);
    // Durable per-order claim spans controllers that use their own transactions.
    // A crash/throw retains the claim for reconciliation rather than replaying effects.
    try {await prisma.systemSetting.create({data:{key:lockKey,value:JSON.stringify({action,state:'pending',started_at:new Date().toISOString()})}});}
    catch(e){if(e.code==='P2002')return {code:409,error:'A test step is pending or uncertain. Check the same order; reconciliation is required.'};throw e;}
    const release=()=>prisma.systemSetting.delete({where:{key:lockKey}});
    const order=await prisma.order.findUnique({where:{id:orderId},include:{items:true}});
    if(!isSynthetic(order,key)){await release();return {code:404,error:'Synthetic test order not found'};}
    if(order.orderStatus===targetStatus[action]){await release();return {code:200};}
    if(!fromStatus[action].includes(order.orderStatus)){await release();return {code:409,error:'This test step is not valid for the current order status.'};}
    const dispatcher={userId:accounts[0].id,email:accounts[0].email,role:'DISPATCHER'};
    const driver={userId:accounts[1].id,email:accounts[1].email,role:'DRIVER'};
    const req={params:{id:orderId},headers:{}};
    let result;
    if(action==='dispatch') {
      await prisma.user.update({where:{id:driver.userId},data:{isOnline:true,lastSeenAt:new Date(),driverAppState:'FOREGROUND'}});
      result=await invoke(assignDriver,{...req,user:dispatcher,body:{driverId:driver.userId}});
    } else if(action==='out_for_delivery') {
      result=await invoke(saveReceipt,{...req,user:driver,body:receiptFixture(order)});
    } else if(action==='cancel') {
      result=await invoke(cancelOrder,{...req,user:dispatcher,body:{orderStatus:'CANCELLED',cancellationReason:'Synthetic staging test'}});
    } else {
      result=await invoke(driverAction,{...req,user:driver,body:{action:targetStatus[action]}});
    }
    if(result.status!==200 || result.payload?.success!==true) {
      await release();return {code:409,error:'The application controller rejected this test step. Check the order status.'};
    }
    const after=await prisma.order.findUnique({where:{id:orderId}});
    if(after?.orderStatus!==targetStatus[action])throw new Error('Controller result requires reconciliation');
    await release();return {code:200};
  };
}
module.exports={WORKFLOW,accounts,PASSWORD_DISABLED,assertAccounts,prepareAccounts,isSynthetic,receiptFixture,createWorkflow};
