require('./guard.cjs').assertStaging();
require('./schema.cjs').prepareSchema();
// No external HTTP providers in this isolated service. Do not start src/server.ts jobs.
global.fetch = async () => { throw new Error('External provider requests disabled in staging'); };
const { prisma } = require('../dist/lib/prisma.js');
const { createOrderController } = require('../dist/controllers/order.controller.js');
const { createOrderSchema } = require('../dist/validators/order.validator.js');
const { assignDriverToOrderController } = require('../dist/controllers/orderAssignment.controller.js');
const { driverActionController } = require('../dist/controllers/driverAction.controller.js');
const { createOrUpdateReceiptController } = require('../dist/controllers/receipt.controller.js');
const { updateOrderStatusController } = require('../dist/controllers/order.controller.js');
const { prepareAccounts, createWorkflow } = require('./workflow.cjs');
const { assertAccounts, accounts } = require('./workflow.cjs');
const { createStaffAccess } = require('./staff-access.cjs');
const { createStaffApi } = require('./staff-api.cjs');
const { requireAuth } = require('../dist/middleware/auth.middleware.js');
const { requireRole } = require('../dist/middleware/role.middleware.js');
const auth = require('../dist/controllers/auth.controller.js');
const presence = require('../dist/controllers/driverPresence.controller.js');
const { createApp } = require('./app.cjs');
const catalog = require('./catalog.json');
async function main() {
  await prisma.$connect();
  await prepareAccounts(prisma);
  for (const item of catalog) await prisma.itemCatalog.upsert({where:{id:item.id},create:{...item,normalizedName:item.name.toLowerCase(),pickupType:'CONVENIENCE',source:'staging-snapshot-2026-10-01'},update:{name:item.name,normalizedName:item.name.toLowerCase(),pickupType:'CONVENIENCE',isActive:true}});
  const workflow=createWorkflow({prisma,assignDriver:assignDriverToOrderController,driverAction:driverActionController,saveReceipt:createOrUpdateReceiptController,cancelOrder:updateOrderStatusController});
  const access=createStaffAccess({prisma,assertAccounts,accounts,hashPassword:require('../dist/utils/hash.js').hashPassword,loginController:auth.loginController,jwt:require('jsonwebtoken'),jwtSecret:process.env.JWT_SECRET});
  const staffApi=createStaffApi({prisma,access,requireAuth,requireRole,controllers:{
    profile:auth.getMyProfileController,drivers:require('../dist/controllers/driverList.controller.js').getAllDriversWithStatsController,
    orders:require('../dist/controllers/orderList.controller.js').listAllOrdersController,driverOrders:require('../dist/controllers/driverOrders.controller.js').getDriverOrdersController,
    online:presence.setDriverOnlineController,offline:presence.setDriverOfflineController,heartbeat:presence.heartbeatDriverController,
    assign:assignDriverToOrderController,priority:require('../dist/controllers/order.controller.js').updateOrderPriorityController,cancel:updateOrderStatusController,
    driverAction:driverActionController,receipt:createOrUpdateReceiptController,getReceipt:require('../dist/controllers/receipt.controller.js').getReceiptByOrderController
  }});
  const app=createApp({prisma,workflow,staffApi,issueAccess:access.issue,createOrder:createOrderController,validateOrder:value=>createOrderSchema.parse(value),apiKey:process.env.STAGING_API_KEY});
  const server=app.listen(Number(process.env.PORT||4000),'0.0.0.0',()=>console.log('Isolated ordering staging ready. No real notifications, dispatch, prices or payments.'));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(async()=>{await prisma.$disconnect();process.exit(0);}));
}
main().catch(e=>{console.error('Staging startup refused',e.name);process.exit(1);});
