import {z} from "zod";

export const POLICY_VERSION = "guelph-pay-at-door-2026-10-01-v1";
export const PRODUCTS = [
  {id:"854ad9e3-e01d-4dfd-ad9b-605287edd059",name:"ice"},
  {id:"295e7930-6f60-44e2-aaeb-a9b0f4288e81",name:"Canada Dry Ginger Ale 2L"},
  {id:"468fa5a3-7888-4012-a9f5-777930c6ae78",name:"Cheese Doritos"},
  {id:"4bf9dc27-ba85-4118-b29a-80bc9c325b27",name:"toilet paper 4 pck"},
] as const;
export const DELIVERY_INSTRUCTIONS = ["","Call on arrival","Ring the doorbell","Use the buzzer","Meet at the entrance"] as const;
export const POLICY = {
  version:POLICY_VERSION,service_area:"Guelph, Ontario",currency:"CAD",payment_timing:"Pay at delivery. No payment is collected in ChatGPT.",
  delivery_fee_before_hst:10.64,debit_surcharge:0,visa_mastercard_surcharge:5,
  prices_reference_date:"2026-10-01",prices_source:"https://www.speedysweeties.ca/",
  item_prices_confirmed:false,stock_confirmed:false,total:null as number|null,
  disclosure:"Items are charged at store prices. Guelph delivery is $10.64 plus HST. Debit has no surcharge; Visa/Mastercard adds $5. Applicable taxes and the final receipt amount are payable at delivery. The final total and item availability are not yet known. No substitutions or extra items without your agreement. This confirmation creates a real delivery order.",
  support_url:"https://www.speedysweeties.ca/",cancellation:"Contact Speedy Sweeties to request a change or cancellation; it is not guaranteed after dispatch.",
} as const;
const item=z.object({product_id:z.enum(PRODUCTS.map(p=>p.id) as [string,...string[]]),quantity:z.number().int().min(1).max(20)}).strict();
export const cartSchema=z.object({items:z.array(item).min(1).max(4)}).strict().superRefine((c,ctx)=>{if(new Set(c.items.map(i=>i.product_id)).size!==c.items.length||c.items.reduce((n,i)=>n+i.quantity,0)>40)ctx.addIssue({code:"custom",message:"Invalid cart"});});
const access=z.string().trim().max(16).regex(/^[a-zA-Z0-9 #*-]*$/).default("");
export const customerSchema=z.object({delivery:z.object({
  name:z.string().trim().min(2).max(120),phone:z.string().trim().transform(v=>v.replace(/\D/g,"")).refine(v=>/^(?:1)?\d{10}$/.test(v)),
  email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),address_line_1:z.string().trim().min(3).max(200),
  unit:access,buzz_code:access,city:z.literal("Guelph"),province:z.literal("Ontario"),delivery_instructions:z.enum(DELIVERY_INSTRUCTIONS).default(""),
}).strict(),payment_method:z.enum(["CASH","DEBIT","VISA","MASTERCARD"])}).strict();
export const confirmationSchema=z.object({review_token:z.string().uuid(),policy_version:z.literal(POLICY_VERSION),confirmed_at:z.string().datetime(),confirmed:z.literal(true),consent_to_share:z.literal(true),accept_pay_at_door:z.literal(true),accept_unknown_total:z.literal(true),real_order_acknowledged:z.literal(true)}).strict();
export const submissionSchema=z.object({request_key:z.string().uuid(),cart:cartSchema,customer:customerSchema,confirmation:confirmationSchema}).strict();
export type Submission=z.infer<typeof submissionSchema>;
export function orderBody(data:Submission){const d=data.customer.delivery;return {
  customerName:d.name,customerPhone:d.phone,customerEmail:d.email,addressLine1:d.address_line_1,unitNumber:d.unit||null,buzzCode:d.buzz_code||null,city:d.city,province:d.province,deliveryInstructions:d.delivery_instructions,
  items:data.cart.items.map(i=>({name:PRODUCTS.find(p=>p.id===i.product_id)!.name,quantity:i.quantity,unitPrice:0,totalPrice:0})),
  subtotal:0,deliveryFee:0,tax:0,tip:0,discount:0,total:0,paymentMethod:data.customer.payment_method,
  orderSource:"UNKNOWN",utmSource:"chatgpt",utmMedium:"customer-plugin",utmCampaign:"guelph-convenience",utmContent:data.request_key,
  notes:"CHATGPT CUSTOMER ORDER. Pay at door; customer acknowledged unknown final total. Zero estimate fields are placeholders, not free items. No substitutions or extra items without customer agreement.",
};}
