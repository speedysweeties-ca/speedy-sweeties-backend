import {prisma} from "../lib/prisma";
import {getCurrentBusinessStatus} from "../controllers/business.controller";
import {createChatGPTOrderController} from "../controllers/order.controller";
import {createChatGPTOrderingRouter} from "../integrations/chatgpt/gateway";
export default createChatGPTOrderingRouter({db:prisma,businessStatus:getCurrentBusinessStatus,createOrder:createChatGPTOrderController,config:()=>({
 enabled:process.env.CHATGPT_ORDERING_ENABLED==="true",apiKey:process.env.CHATGPT_ORDERING_API_KEY??"",policyVersion:process.env.CHATGPT_ORDERING_POLICY_VERSION??"",
})});
