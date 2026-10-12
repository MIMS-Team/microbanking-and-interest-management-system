import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
const banking=process.argv.includes('--banking');
const browsers=['chromium','firefox','webkit'];
if(process.platform==='win32'&&['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some(existsSync))browsers.push('edge');
for(const browser of browsers){
  const args=banking?['scripts/run-auth-production-e2e.mjs','--project=production-'+browser]:['scripts/run-e2e.mjs','--project='+browser];
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{windowsHide:true,stdio:'inherit',env:{...process.env,...(banking?{AUTH_VERIFY_BANKING:'1'}:{})}});child.once('error',reject);child.once('exit',resolve);});
  if(code!==0){process.exitCode=code??1;break;}
}
