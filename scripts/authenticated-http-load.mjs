import https from 'node:https';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {randomUUID} from 'node:crypto';

export async function authenticatedHttpLoad({url,mailboxURL,mailboxToken,fixture}){
  const target=new URL(url);
  const agentFor=i=>new https.Agent({keepAlive:true,rejectUnauthorized:false,localAddress:`127.0.0.${i+2}`,lookup:(_host,options,callback)=>options.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4)});
  const clients=fixture.users.map((user,i)=>({user,cookie:'',agent:agentFor(i)}));
  // All responses have completed at each phase boundary. Retire sockets that
  // early users left idle while slower users authenticate; do not replay requests
  // on a reset keep-alive connection. Workload timing includes its fresh TLS.
  const nextPhase=()=>clients.forEach((client,i)=>{client.agent.destroy();client.agent=agentFor(i);});
  const metrics={dashboard:[],transaction:[],report:[]};
  const request=(client,path,body)=>new Promise((resolve,reject)=>{
    const bytes=body?Buffer.from(JSON.stringify(body)):null;
    const req=https.request({hostname:target.hostname,port:target.port,path,agent:client.agent,method:body?'POST':'GET',headers:{...(bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{}),Cookie:client.cookie,Origin:target.origin}},response=>{let data='';response.setEncoding('utf8');response.on('data',chunk=>{data+=chunk;});response.on('end',()=>{let result;try{result=JSON.parse(data);}catch{return reject(new Error('Non-JSON workload response '+response.statusCode));}resolve({status:response.statusCode,body:result,cookies:response.headers['set-cookie']||[]});});});
    req.setTimeout(30000,()=>req.destroy(new Error('HTTP workload timed out')));req.on('error',error=>reject(new Error(`${error.message} at ${path}; reused socket: ${req.reusedSocket}`,{cause:error})));req.end(bytes);
  });
  let failures=0;
  try{
    // Each source is a real loopback socket address. The owned ingress overwrites
    // forwarding headers from that socket; no relaxed limits or fabricated
    // sessions are used. All seventy users log in and complete their SMTP OTP.
    await Promise.all(clients.map(async client=>{const result=await request(client,'/api/auth/login',{email:client.user.email,password:fixture.password});assert.equal(result.status,202);client.cookie=result.cookies.map(c=>c.split(';')[0]).join('; ');}));
    nextPhase();
    const messages=await (await fetch(mailboxURL,{headers:{authorization:'Bearer '+mailboxToken}})).json();
    await Promise.all(clients.map(async client=>{const code=messages.filter(m=>m.recipients.includes(client.user.email)).at(-1)?.raw.match(/verification code is: (\d{6})/)?.[1];assert.ok(code);const response=await request(client,'/api/auth/otp',{code});assert.equal(response.status,200);client.cookie=response.cookies.map(c=>c.split(';')[0]).join('; ');const identity=await request(client,'/api/auth/session');assert.equal(identity.status,200);assert.equal(identity.body.user.id,client.user.id);}));
    nextPhase();
    const start=performance.now();
    const outcomes=await Promise.allSettled(clients.map(async(client,i)=>{
      let at=performance.now();const dashboard=await request(client,'/api/bootstrap?resource=transactions&pageSize=8');metrics.dashboard.push(performance.now()-at);assert.equal(dashboard.status,200);assert.equal(dashboard.body.user.id,client.user.id);
      if(client.user.role==='agent'){
        assert.ok(dashboard.body.accounts.every(a=>a.agent_id===client.user.id));
        const type=['deposit','withdrawal','transfer'][i%3],payload={action:'transaction.create',type,account_id:client.user.accountId,destination_account_id:type==='transfer'?client.user.destinationId:undefined,amount:'1.23',description:'Fictional HTTP workload',verified_customer_id:type==='deposit'?undefined:client.user.customerId,verification_method:type==='deposit'?undefined:'nic-in-person',idempotency_key:randomUUID()};
        at=performance.now();const posted=await request(client,'/api/actions',payload);metrics.transaction.push(performance.now()-at);assert.equal(posted.status,200);const retry=await request(client,'/api/actions',payload);assert.equal(retry.status,200);
      }else{at=performance.now();const report=await request(client,'/api/reports?type='+['agent-transactions','account-summary','active-fds','monthly-interest','customer-cashflow'][i%5]+'&from=2026-01-01&to=2026-12-31');metrics.report.push(performance.now()-at);assert.equal(report.status,200);assert.ok(Array.isArray(report.body.rows));}
    }));
    failures=outcomes.filter(o=>o.status==='rejected').length;
    const summary={sessions:clients.length,concurrency:70,dataset:fixture.counts,environment:{node:process.version,platform:process.platform,https:'owned loopback TLS ingress',database:'disposable MySQL',pool:10},wall_ms:performance.now()-start,failures,service_timings:{}};
    for(const [name,values]of Object.entries(metrics)){const sorted=values.sort((a,b)=>a-b),pct=p=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]||0;summary.service_timings[name]={samples:values.length,p50_ms:pct(.5),p95_ms:pct(.95),p99_ms:pct(.99),max_ms:sorted.at(-1)||0,target_ms:{dashboard:3000,transaction:5000,report:15000}[name]};}
    console.log('AUTHENTICATED_HTTP_LOAD '+JSON.stringify(summary));
    assert.equal(failures,0,outcomes.filter(o=>o.status==='rejected').map(o=>o.reason.message).join('\n'));
    for(const result of Object.values(summary.service_timings))assert.ok(result.max_ms<=result.target_ms,'Measured service exceeded its unchanged SRS target');
    return summary;
  }finally{clients.forEach(c=>c.agent.destroy());}
}
