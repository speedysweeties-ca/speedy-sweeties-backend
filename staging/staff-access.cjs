const {randomBytes,randomUUID}=require('node:crypto');
const {z}=require('zod');
const GRANT_PREFIX='chatgpt-staging-staff:';
const DURATION_MS=2*60*60*1000;
async function readGrant(prisma,id){const row=await prisma.systemSetting.findUnique({where:{key:GRANT_PREFIX+id}});return row?JSON.parse(row.value):null;}
async function permittedPassword(prisma,user,disabled){
  if(user.passwordHash===disabled)return true;
  const grant=await readGrant(prisma,user.id);
  return !!grant && grant.passwordHash===user.passwordHash && /^\$2[aby]\$\d\d\$/.test(user.passwordHash) && Number.isFinite(grant.issuedAt) && grant.expiresAt===grant.issuedAt+DURATION_MS && typeof grant.id==='string';
}
function createStaffAccess({prisma,assertAccounts,accounts,hashPassword,loginController,jwt,jwtSecret}){
  async function issue(req,res){
    const {role}=z.object({role:z.enum(['DISPATCHER','DRIVER'])}).strict().parse(req.body);
    await assertAccounts(prisma);
    const account=accounts.find(a=>a.role===role),password=randomBytes(24).toString('base64url');
    const passwordHash=await hashPassword(password),issuedAt=Date.now(),expiresAt=issuedAt+DURATION_MS;
    const grant={id:randomUUID(),passwordHash,issuedAt,expiresAt};
    await prisma.$transaction(async tx=>{
      await tx.user.update({where:{id:account.id},data:{passwordHash,forceLogoutAt:null}});
      await tx.systemSetting.upsert({where:{key:GRANT_PREFIX+account.id},create:{key:GRANT_PREFIX+account.id,value:JSON.stringify(grant)},update:{value:JSON.stringify(grant)}});
    });
    res.json({environment:'isolated-staging',role,email:account.email,password,expires_at:expiresAt});
  }
  async function login(req,res){
    const input=z.object({email:z.string().email(),password:z.string().min(1).max(100)}).strict().safeParse(req.body);
    const account=input.success?accounts.find(a=>a.email===input.data.email.trim().toLowerCase()):null;
    if(!account)return res.status(401).json({message:'Invalid or expired test credentials'});
    await assertAccounts(prisma);
    const grant=await readGrant(prisma,account.id);
    if(!grant||grant.expiresAt<=Date.now())return res.status(401).json({message:'Test access expired. Generate new credentials on the private test page.'});
    let status=200,payload;
    await loginController({...req,body:input.data},{status(n){status=n;return this;},json(v){payload=v;return this;}});
    if(status!==200||!payload?.token)return res.status(status).json({message:'Invalid or expired test credentials'});
    // Use the real password/login controller, with a staging-only, short-lived grant.
    const token=jwt.sign({userId:account.id,email:account.email,role:account.role,stagingGrant:grant.id},jwtSecret,{algorithm:'HS256',expiresIn:Math.max(1,Math.floor((grant.expiresAt-Date.now())/1000))});
    res.json({message:'Synthetic staging login successful',token});
  }
  async function session(req,res,next){
    await assertAccounts(prisma);
    const grant=await readGrant(prisma,req.user?.userId);
    if(!grant||grant.id!==req.user?.stagingGrant||grant.expiresAt<=Date.now())return res.status(401).json({message:'Test session expired'});
    next();
  }
  return {issue,login,session};
}
module.exports={GRANT_PREFIX,DURATION_MS,readGrant,permittedPassword,createStaffAccess};
