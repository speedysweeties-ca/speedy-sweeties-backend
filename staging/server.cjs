require('./guard.cjs').assertStaging();
// No external HTTP providers in this isolated service. Do not start src/server.ts jobs.
global.fetch = async () => { throw new Error('External provider requests disabled in staging'); };
const { prisma } = require('../dist/lib/prisma.js');
const { createOrderController } = require('../dist/controllers/order.controller.js');
const { createOrderSchema } = require('../dist/validators/order.validator.js');
const { createApp } = require('./app.cjs');
const catalog = require('./catalog.json');
async function main() {
  await prisma.$connect();
  if (await prisma.user.count()) throw new Error('Expected an isolated database with no staff or driver accounts');
  for (const item of catalog) await prisma.itemCatalog.upsert({where:{id:item.id},create:{...item,normalizedName:item.name.toLowerCase(),pickupType:'CONVENIENCE',source:'staging-snapshot-2026-10-01'},update:{name:item.name,normalizedName:item.name.toLowerCase(),pickupType:'CONVENIENCE',isActive:true}});
  const app=createApp({prisma,createOrder:createOrderController,validateOrder:value=>createOrderSchema.parse(value),apiKey:process.env.STAGING_API_KEY});
  const server=app.listen(Number(process.env.PORT||4000),'0.0.0.0',()=>console.log('Isolated ordering staging ready. No real notifications, dispatch, prices or payments.'));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>server.close(async()=>{await prisma.$disconnect();process.exit(0);}));
}
main().catch(e=>{console.error('Staging startup refused',e.name);process.exit(1);});
