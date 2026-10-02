const {z}=require('zod');
const sampleDelivery={name:'Test Customer',phone:'5195550100',email:'ordering-test@example.invalid',address_line_1:'1 Synthetic Test Street',unit:'',buzz_code:'',city:'Guelph',province:'Ontario',delivery_instructions:''};
// The staging boundary accepts these fictional values only, independently of the Site.
const customerSchema=z.object({delivery:z.object({
 name:z.literal(sampleDelivery.name),phone:z.literal(sampleDelivery.phone),email:z.literal(sampleDelivery.email),
 address_line_1:z.literal(sampleDelivery.address_line_1),city:z.literal('Guelph'),province:z.literal('Ontario'),
 unit:z.enum(['','TEST-101']),buzz_code:z.enum(['','TEST-123']),delivery_instructions:z.enum(['','Test delivery instructions']),
}).strict(),payment_method:z.enum(['CASH','DEBIT','VISA','MASTERCARD'])}).strict();
function customerBody(raw){
 const {delivery:d,payment_method}=customerSchema.parse(raw);
 return {customerPhone:d.phone,customerEmail:d.email,addressLine1:d.address_line_1,unitNumber:d.unit||null,buzzCode:d.buzz_code||null,city:d.city,province:d.province,deliveryInstructions:d.delivery_instructions,paymentMethod:payment_method};
}
function verifiedCustomer(order,raw){
 if(!raw)return null;
 const c=customerSchema.parse(raw),d=c.delivery;
 if(order.customerName!=='CHATGPT STAGING TEST — DO NOT DELIVER'||order.phone!==d.phone||order.email!==d.email||order.addressLine1!==d.address_line_1||order.city!==d.city||order.province!==d.province||(order.unitNumber||'')!==d.unit||(order.buzzCode||'')!==d.buzz_code||order.paymentMethod!==c.payment_method||(d.delivery_instructions&&!String(order.additionalNotes).includes(d.delivery_instructions)))throw new Error('Persisted test customer details differ from the review');
 return c;
}
module.exports={customerSchema,sampleDelivery,customerBody,verifiedCustomer};
