import {createHash,timingSafeEqual} from "node:crypto";
import {Router,Request,Response} from "express";
import rateLimit from "express-rate-limit";
import {z} from "zod";
import type {Prisma,PrismaClient} from "@prisma/client";
import {createOrderSchema} from "../../validators/order.validator";
import {POLICY,POLICY_VERSION,PRODUCTS,submissionSchema,orderBody} from "./contract";

type Config={enabled:boolean;apiKey:string;policyVersion:string};
type Business={source:string;isOpen:boolean;nextOpenText?:string|null};
type RecordValue={owner:string;hash:string;state:"pending"|"complete"|"rejected";orderId?:string;createdAt:string;confirmation:unknown};
type Dependencies={db:Pick<PrismaClient,"systemSetting"|"order"|"itemCatalog">;config:()=>Config;businessStatus:()=>Promise<Business>;createOrder:(req:Request,res:Response,onCreated:(tx:Prisma.TransactionClient,id:string)=>Promise<void>)=>Promise<void>};
const prefix="chatgpt-order-v1:";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const orderSelect={id:true,orderNumber:true,orderStatus:true,assignedDriverId:true,createdAt:true,utmSource:true,utmMedium:true,utmContent:true,digitalReceipt:{select:{grandTotal:true,receiptNumber:true}}} satisfies Prisma.OrderSelect;

export function createChatGPTOrderingRouter(deps:Dependencies){
 const router=Router();
 router.use((_req,res,next)=>{res.set("Cache-Control","no-store");next();});
 router.use((req,res,next)=>{
  const config=deps.config();
  if(config.apiKey.length<32)return void res.status(503).json({code:"ORDERING_DISABLED",message:"ChatGPT ordering is not available."});
  const received=digest(req.get("authorization")||""),expected=digest("Bearer "+config.apiKey);
  if(!timingSafeEqual(Buffer.from(received),Buffer.from(expected)))return void res.status(401).json({code:"UNAUTHORIZED",message:"Authentication required."});
  const owner=req.get("x-speedy-customer")||"";if(!/^[a-f0-9]{64}$/.test(owner))return void res.status(401).json({code:"UNAUTHORIZED",message:"Customer identity required."});
  res.locals.customerKey=owner;next();
 });
 // One service key serves many customers; limit each trusted, pseudonymous customer.
 router.use(rateLimit({windowMs:60000,limit:60,standardHeaders:"draft-8",legacyHeaders:false,keyGenerator:(_req,res)=>res.locals.customerKey,message:{code:"RATE_LIMIT",message:"Please wait before checking again."}}));
 async function catalogueReady(){const rows=await deps.db.itemCatalog.findMany({where:{id:{in:PRODUCTS.map(p=>p.id)}},select:{id:true,name:true}});return rows.length===PRODUCTS.length&&PRODUCTS.every(p=>rows.some(r=>r.id===p.id&&r.name===p.name));}
 async function read(key:string,owner:string){const row=await deps.db.systemSetting.findUnique({where:{key:prefix+key}});if(!row)return null;const saved=JSON.parse(row.value) as RecordValue;return saved.owner===owner?saved:null;}
 async function result(key:string,saved:RecordValue){
  if(saved.state!=="complete"||!saved.orderId)return {environment:"production",request_key:key,state:saved.state,status:null as string|null,real_delivery:true,pricing_verified:false,final_total:null as number|null};
  const order=await deps.db.order.findUnique({where:{id:saved.orderId},select:orderSelect});
  if(!order||order.utmSource!=="chatgpt"||order.utmMedium!=="customer-plugin"||order.utmContent!==key)throw new Error("Order mapping requires reconciliation");
  const total=order.digitalReceipt?Number(order.digitalReceipt.grandTotal):null;
  return {environment:"production",request_key:key,state:"submitted",order_id:order.id,order_number:order.orderNumber,status:order.orderStatus,assigned_driver:!!order.assignedDriverId,created_at:order.createdAt,real_delivery:true,pricing_verified:total!==null,final_total:total,receipt_number:order.digitalReceipt?.receiptNumber??null,currency:"CAD"};
 }
 router.get("/availability",async(_req,res,next)=>{try{
  const config=deps.config();if(!config.enabled||config.policyVersion!==POLICY_VERSION)return void res.json({environment:"production",enabled:false,accepting_orders:false,reason:"ORDERING_DISABLED",policy:POLICY,items:PRODUCTS});
  const [business,catalogue]=await Promise.all([deps.businessStatus(),catalogueReady()]);
  const verified=business.source==="google_places";
  res.json({environment:"production",enabled:true,accepting_orders:verified&&business.isOpen&&catalogue,reason:!catalogue?"CATALOGUE_CHANGED":!verified?"HOURS_UNVERIFIED":!business.isOpen?"CLOSED":null,hours_verified:verified,open:verified?business.isOpen:null,next_open_text:business.nextOpenText??null,stock_checked:false,policy:POLICY,items:PRODUCTS});
 }catch(e){next(e);}});
 router.get("/orders/:key",async(req,res,next)=>{try{const key=z.string().uuid().parse(req.params.key),saved=await read(key,res.locals.customerKey);if(!saved)return void res.status(404).json({code:"NOT_FOUND",message:"Order not found."});res.json(await result(key,saved));}catch(e){next(e);}});
 router.post("/orders",rateLimit({windowMs:15*60000,limit:10,standardHeaders:"draft-8",legacyHeaders:false,keyGenerator:(_req,res)=>res.locals.customerKey,message:{code:"RATE_LIMIT",message:"Too many order attempts. Check your saved order."}}),async(req,res,next)=>{try{
  if(Buffer.byteLength(JSON.stringify(req.body??{}))>8192)return void res.status(413).json({code:"INVALID_REQUEST",message:"Request too large."});
  const data=submissionSchema.parse(req.body);data.cart.items.sort((a,b)=>a.product_id.localeCompare(b.product_id));
  const owner=res.locals.customerKey as string,key=prefix+data.request_key,hash=digest(JSON.stringify(data));
  const previous=await read(data.request_key,owner);
  if(previous){if(previous.hash!==hash)return void res.status(409).json({code:"DETAILS_CHANGED",message:"This reference belongs to different confirmed details."});return void res.json(await result(data.request_key,previous));}
  const config=deps.config();if(!config.enabled||config.policyVersion!==POLICY_VERSION)return void res.status(503).json({code:"ORDERING_DISABLED",message:"New ChatGPT orders are paused."});
  const confirmed=Date.parse(data.confirmation.confirmed_at);if(confirmed>Date.now()+60000||confirmed<Date.now()-30*60000)return void res.status(409).json({code:"REVIEW_EXPIRED",message:"Please review and confirm this order again."});
  const [business,catalogue]=await Promise.all([deps.businessStatus(),catalogueReady()]);
  if(!catalogue)return void res.status(409).json({code:"CATALOGUE_CHANGED",message:"The catalogue changed. No order was submitted."});
  if(business.source!=="google_places"||!business.isOpen)return void res.status(409).json({code:business.source!=="google_places"?"HOURS_UNVERIFIED":"CLOSED",message:"Speedy Sweeties is not confirmed open. No order was submitted."});
  const saved:RecordValue={owner,hash,state:"pending",createdAt:new Date().toISOString(),confirmation:data.confirmation};
  try{await deps.db.systemSetting.create({data:{key,value:JSON.stringify(saved)}});}catch(e){if((e as {code?:string}).code!=="P2002")throw e;const concurrent=await read(data.request_key,owner);if(!concurrent)return void res.status(404).json({code:"NOT_FOUND",message:"Order not found."});if(concurrent.hash!==hash)return void res.status(409).json({code:"DETAILS_CHANGED",message:"Order details changed."});return void res.json(await result(data.request_key,concurrent));}
  let controllerStatus=200;
  const controllerResponse={status(code:number){controllerStatus=code;return this;},json(){return this;}} as unknown as Response;
  const body=createOrderSchema.parse({body:orderBody(data)}).body;
  try{
   await deps.createOrder({body,headers:{}} as Request,controllerResponse,async(tx,id)=>{
    // Commit the request->order ownership mapping IN THE ORDER TRANSACTION.
    // A crash or notification failure after commit cannot lose the mapping.
    await tx.systemSetting.update({where:{key},data:{value:JSON.stringify({...saved,state:"complete",orderId:id})}});
   });
  }catch{
   const after=await read(data.request_key,owner);if(after?.state==="complete")return void res.json(await result(data.request_key,after));
   return void res.status(503).json({code:"SUBMISSION_UNCERTAIN",message:"Receipt is unconfirmed. Check this same order reference; do not submit another."});
  }
  const after=await read(data.request_key,owner);
  if(after?.state==="complete")return void res.status(201).json(await result(data.request_key,after));
  if(controllerStatus>=400&&controllerStatus<500){await deps.db.systemSetting.update({where:{key},data:{value:JSON.stringify({...saved,state:"rejected"})}});return void res.status(409).json({code:"ORDER_REJECTED",message:"The order was not accepted. Check the details before making a new request."});}
  res.status(503).json({code:"SUBMISSION_UNCERTAIN",message:"Check this same order reference. Do not submit another."});
 }catch(e){next(e);}});
 router.use((error:unknown,_req:Request,res:Response,_next:unknown):void=>{
  if(error instanceof z.ZodError)return void res.status(400).json({code:"INVALID_REQUEST",message:"Use supported items, delivery details and explicit confirmation."});
  console.error("ChatGPT order gateway failed",error instanceof Error?error.name:"UnknownError");
  res.status(503).json({code:"UNAVAILABLE",message:"The request could not be confirmed. Check the same order reference."});
 });
 return router;
}
