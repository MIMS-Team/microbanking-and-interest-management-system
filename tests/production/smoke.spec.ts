import {test,expect,expectHttpError} from '../e2e/fixtures';

test('isolated production HTTP routes use one authenticated MySQL identity',async({page})=>{
  await page.goto('/login');
  expectHttpError(page,'/api/bootstrap',401);
  expect(await page.evaluate(async()=> (await fetch('/api/bootstrap')).status)).toBe(401);
  await page.locator('input[type="email"]').fill('production-agent@example.test');
  await page.locator('input[type="password"]').fill('ProductionFixture!2026');
  await page.getByRole('button',{name:'Continue with 2FA'}).click();await page.waitForURL(/\/otp/);
  let code='';
  await expect.poll(async()=>{
    const response=await fetch(process.env.AUTH_VERIFY_MAILBOX!,{headers:{authorization:`Bearer ${process.env.AUTH_VERIFY_MAILBOX_TOKEN}`}});
    const messages=await response.json() as Array<{recipients:string[];raw:string}>;
    code=messages.find(m=>m.recipients.includes('production-agent@example.test'))?.raw.match(/verification code is: (\d{6})/)?.[1]??'';
    return Boolean(code);
  }).toBe(true);
  await page.getByPlaceholder('000000').fill(code);await page.getByRole('button',{name:'Verify & Authorize Session'}).click();await page.waitForURL(/\/dashboard/);
  for(const route of ['/api/bootstrap','/api/savings','/api/fixed-deposits']) {
    const response=await page.evaluate(async url=>{const r=await fetch(url);return {status:r.status,body:await r.json()};},route);
    expect(response.status).toBe(200);
    if(route==='/api/bootstrap') expect(response.body.user.email).toBe('production-agent@example.test');
  }
  expectHttpError(page,'/api/reports',403);
  expect(await page.evaluate(async()=> (await fetch('/api/reports?type=account-summary')).status)).toBe(403);
  expectHttpError(page,'/api/fixed-deposits/approve',403);
  expect(await page.evaluate(async()=> (await fetch('/api/fixed-deposits/approve',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({userRole:'Higher Management',fdNumber:'fictional'})})).status)).toBe(403);
  expectHttpError(page,'/api/cron/interest',403);
  expect(await page.evaluate(async()=> (await fetch('/api/cron/interest',{method:'POST'})).status)).toBe(403);
  expect(await page.evaluate(async()=> (await fetch('/api/auth/logout',{method:'POST'})).status)).toBe(200);
  expectHttpError(page,'/api/bootstrap',401);
  expect(await page.evaluate(async()=> (await fetch('/api/bootstrap')).status)).toBe(401);
});
