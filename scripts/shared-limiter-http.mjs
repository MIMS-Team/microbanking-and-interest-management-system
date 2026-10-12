import https from 'node:https';
import assert from 'node:assert/strict';
export async function verifyTwoInstanceLimits({urls,fixture,unavailable}){
  const agents=urls.map(()=>new https.Agent({rejectUnauthorized:false,keepAlive:true,localAddress:'127.0.0.200',lookup:(_host,options,cb)=>options.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4)}));
  const send=(index,path,body,cookie='')=>new Promise((resolve,reject)=>{
    const url=new URL(urls[index]),bytes=Buffer.from(JSON.stringify(body));
    const req=https.request({hostname:url.hostname,port:url.port,path,method:'POST',agent:agents[index],headers:{'Content-Type':'application/json','Content-Length':bytes.length,Origin:url.origin,Cookie:cookie,'x-forwarded-for':`203.0.113.${Math.floor(Math.random()*200)}`,'x-e2e-test':'true'}},r=>{let raw='';r.setEncoding('utf8');r.on('data',c=>raw+=c);r.on('end',()=>resolve({status:r.statusCode,body:JSON.parse(raw),headers:r.headers}));});req.on('error',reject);req.end(bytes);
  });
  try{
    const statuses=[];for(let i=0;i<6;i++){const response=await send(i%2,'/api/auth/login',{email:'two-instance-fictional@example.test',password:'FictionalWrong!2026'});statuses.push(response.status);if(i===5){assert.equal(response.status,429);assert.ok(Number(response.headers['retry-after'])>0);}}
    assert.deepEqual(statuses,[401,401,401,401,401,429]);
    // Only the harness-owned database may simulate a limiter outage.
    await unavailable(async()=>{
      const response=await send(1,'/api/auth/login',{email:'store-unavailable@example.test',password:'FictionalWrong!2026'});assert.equal(response.status,503);assert.equal(response.body.code,'LIMITER_UNAVAILABLE');
    });
    for(let i=0;i<agents.length;i++){agents[i].destroy();agents[i]=new https.Agent({rejectUnauthorized:false,keepAlive:true,localAddress:'127.0.0.201',lookup:(_host,options,cb)=>options.all?cb(null,[{address:'127.0.0.1',family:4}]):cb(null,'127.0.0.1',4)});}
    const login=await send(0,'/api/auth/login',{email:fixture.users[0].email,password:fixture.password});assert.equal(login.status,202);
    const otpCookie=login.headers['set-cookie'].map(c=>c.split(';')[0]).join('; ');
    for(const index of [0,1]){const cooldown=await send(index,'/api/auth/otp/resend',{},otpCookie);assert.equal(cooldown.status,429);assert.ok(Number(cooldown.headers['retry-after'])>0);}
    console.log('TWO_INSTANCE_LIMITS '+JSON.stringify({instances:2,statuses,spoofed_forwarding_ignored:true,client_test_header_ignored:true,unavailable_store_status:503,fixture_sessions:fixture.users.length}));
    return {instances:2,statuses,unavailable_store_status:503,otp_cooldown_statuses:[429,429]};
  }finally{agents.forEach(a=>a.destroy());}
}
