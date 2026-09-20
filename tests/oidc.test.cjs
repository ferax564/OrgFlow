'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto');
const {createApp}=require('../server/lib/app');
const auth=require('../server/lib/auth');
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));

test('OIDC validates browser binding, PKCE, signed identity, nonce, verified email, expiry and replay',async t=>{
  const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'test',use:'sig',alg:'RS256'};
  let issuer,nonce,challenge,mode='valid',exchanges=0;
  const jwt=()=>{
    const now=Math.floor(Date.now()/1000),claims={iss:issuer,aud:'orgflow',sub:'user-123',iat:now,exp:mode==='expired'?now-600:now+300,nonce:mode==='nonce'?'wrong':nonce};
    const data=[{alg:'RS256',kid:'test'},claims].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
    return data+'.'+crypto.sign('RSA-SHA256',Buffer.from(data),privateKey).toString('base64url');
  };
  const provider=http.createServer(async(req,res)=>{
    let data;
    if(req.url==='/.well-known/openid-configuration')data={issuer,authorization_endpoint:issuer+'/authorize',token_endpoint:issuer+'/token',userinfo_endpoint:issuer+'/userinfo',jwks_uri:issuer+'/jwks',response_types_supported:['code'],subject_types_supported:['public'],id_token_signing_alg_values_supported:['RS256'],token_endpoint_auth_methods_supported:['none']};
    else if(req.url==='/jwks')data={keys:[jwk]};
    else if(req.url==='/userinfo')data={sub:'user-123',email:'owner@example.test',email_verified:mode!=='unverified',name:'Owner'};
    else if(req.url==='/token'){
      const chunks=[];for await(const chunk of req)chunks.push(chunk);
      const form=new URLSearchParams(Buffer.concat(chunks).toString());
      assert.equal(crypto.createHash('sha256').update(form.get('code_verifier')).digest('base64url'),challenge);
      exchanges++;data={access_token:'test-access',token_type:'Bearer',expires_in:300,id_token:jwt()};
    }else{res.writeHead(404);res.end();return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));
  });
  issuer=await listen(provider);t.after(()=>new Promise(r=>provider.close(r)));
  const app=createApp({memory:true,config:{authMode:'oidc',issuer,clientId:'orgflow',sessionSecret:'a'.repeat(40),bootstrapAdminEmail:'owner@example.test'}});
  const base=await listen(app.server);app.config.publicUrl=base;
  t.after(()=>new Promise(r=>app.server.close(()=>{app.db.close();r();})));
  async function start(){
    const login=await fetch(base+'/auth/login',{redirect:'manual'});assert.equal(login.status,302);
    const url=new URL(login.headers.get('location'));nonce=url.searchParams.get('nonce');challenge=url.searchParams.get('code_challenge');
    return {state:url.searchParams.get('state'),cookie:login.headers.getSetCookie()[0].split(';')[0]};
  }
  const first=await start(),callback=base+'/auth/callback?code=code&state='+first.state;
  assert.equal((await fetch(callback,{redirect:'manual'})).status,400);
  assert.equal(exchanges,0,'wrong-browser callbacks must not exchange the code');
  const valid=await fetch(callback,{headers:{cookie:first.cookie},redirect:'manual'});
  assert.equal(valid.status,302);assert.equal(valid.headers.get('location'),'/app.html');
  const sid=valid.headers.getSetCookie().find(c=>c.startsWith(auth.COOKIE+'=')).split(';')[0];
  assert.equal((await fetch(base+'/api/session',{headers:{cookie:sid}})).status,200);
  assert.equal((await fetch(callback,{headers:{cookie:first.cookie},redirect:'manual'})).status,400);
  for(const failure of ['nonce','expired','unverified']){
    mode=failure;const attempt=await start();
    const response=await fetch(base+'/auth/callback?code=code&state='+attempt.state,{headers:{cookie:attempt.cookie},redirect:'manual'});
    assert.equal(response.status,401,failure);
  }
  await fetch(base+'/auth/logout',{headers:{cookie:sid},redirect:'manual'});
  assert.equal((await fetch(base+'/api/session',{headers:{cookie:sid}})).status,401);
});
