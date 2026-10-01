const express=require('express');
const {rateLimit}=require('express-rate-limit');
const {z}=require('zod');
const {assertAccounts,isSynthetic,WORKFLOW}=require('./workflow.cjs');
function createStaffApi({prisma,access,requireAuth,requireRole,controllers}){
  const router=express.Router();
  const staff=requireRole(['DISPATCHER']),driver=requireRole(['DRIVER']);
  router.post('/auth/login',rateLimit({windowMs:10*60*1000,limit:30,standardHeaders:true,legacyHeaders:false}),access.login);
  router.use(requireAuth,access.session);
  const valid=(schema)=>(req,_res,next)=>{req.body=schema.parse(req.body);next();};
  const empty=z.object({}).strict();
  const wrapOrder=controller=>async(req,res)=>{
    const id=z.string().uuid().parse(req.params.id);
    await assertAccounts(prisma);
    const lockKey='chatgpt-staging-action:'+id;
    try{await prisma.systemSetting.create({data:{key:lockKey,value:JSON.stringify({state:'pending',action:'staff-api',started_at:new Date().toISOString()})}});}
    catch(e){if(e.code==='P2002')return res.status(409).json({message:'Test step pending or uncertain; check the same order.'});throw e;}
    const release=()=>prisma.systemSetting.delete({where:{key:lockKey}});
    const order=await prisma.order.findUnique({where:{id},include:{items:true}});
    const reservation=order?await prisma.systemSetting.findUnique({where:{key:'chatgpt-staging:'+order.utmContent}}):null;
    const saved=reservation?JSON.parse(reservation.value):null;
    if(!isSynthetic(order,order?.utmContent)||saved?.state!=='complete'||saved.orderId!==id||saved.workflow!==WORKFLOW){await release();return res.status(404).json({message:'Only new synthetic workflow orders can be changed here.'});}
    let status=200,payload;
    await controller(req,{status(n){status=n;return this;},json(v){payload=v;return this;}});
    // Throws retain the durable claim, just like the checkout workflow adapter.
    await release();res.status(status).json(payload);
  };
  router.get('/auth/me',controllers.profile);
  router.get('/auth/drivers',staff,controllers.drivers);
  router.get('/orders/auto-dispatch',staff,(_req,res)=>res.json({success:true,enabled:false,autoDispatchEnabled:false}));
  router.get('/orders/settings/google-live-traffic',staff,(_req,res)=>res.json({success:true,enabled:false,googleLiveTrafficEnabled:false}));
  router.get('/orders',staff,controllers.orders);
  router.get('/driver/orders',driver,controllers.driverOrders);
  router.post('/driver/online',driver,valid(empty),controllers.online);
  router.post('/driver/offline',driver,valid(empty),controllers.offline);
  router.post('/driver/heartbeat',driver,valid(z.object({appState:z.enum(['FOREGROUND','BACKGROUND']).optional()}).strict()),controllers.heartbeat);
  router.patch('/orders/:id/assign-driver',staff,valid(z.object({driverId:z.literal('staging-driver-1').nullable(),priority:z.enum(['NORMAL','HIGH']).optional()}).strict()),wrapOrder(controllers.assign));
  router.patch('/orders/:id/priority',staff,valid(z.object({priority:z.enum(['NORMAL','HIGH'])}).strict()),wrapOrder(controllers.priority));
  router.patch('/orders/:id/status',staff,valid(z.object({orderStatus:z.literal('CANCELLED'),cancellationReason:z.string().max(500).nullable().optional()}).strict()),(req,_res,next)=>{req.body.cancellationReason='Synthetic staging staff test';next();},wrapOrder(controllers.cancel));
  router.post('/orders/:id/driver-action',driver,valid(z.object({action:z.enum(['ACCEPTED','OUT_FOR_DELIVERY','DELIVERED'])}).strict()),wrapOrder(controllers.driverAction));
  const amount=z.number().finite().min(0).max(1000);
  router.post('/orders/:id/receipt',driver,valid(z.object({itemTotal:amount,deliveryCharge:amount,taxOrFees:amount,grandTotal:amount,notes:z.string().max(2000).nullable().optional()}).strict()),(req,_res,next)=>{req.body.notes='SYNTHETIC STAGING RECEIPT. Fictional amounts only. No amount due or payment.';next();},wrapOrder(controllers.receipt));
  router.get('/orders/:id/receipt',requireRole(['DISPATCHER','DRIVER']),controllers.getReceipt);
  router.use((_req,res)=>res.status(404).json({message:'This endpoint is not enabled in isolated staging.'}));
  return router;
}
module.exports={createStaffApi};
