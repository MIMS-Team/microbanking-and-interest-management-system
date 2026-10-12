import type { Page } from '@playwright/test';
import { test, expect, expectHttpError } from '../e2e/fixtures';

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill('Demo@12345');
  await page.getByRole('button',{name:'Continue with 2FA'}).click();
  await page.waitForURL(/\/otp/);
  let code='';
  await expect.poll(async()=>{
    const response=await fetch(process.env.AUTH_VERIFY_MAILBOX!,{headers:{authorization:`Bearer ${process.env.AUTH_VERIFY_MAILBOX_TOKEN}`}});
    const messages=await response.json() as Array<{id:number;recipients:string[];raw:string}>;
    const message=messages.filter(item=>item.recipients.includes(email)).sort((a,b)=>b.id-a.id)[0];
    code=message?.raw.match(/verification code is: (\d{6})/)?.[1]??'';
    return Boolean(code);
  }).toBe(true);
  await page.getByPlaceholder('000000').fill(code);
  await page.getByRole('button',{name:'Verify & Authorize Session'}).click();
  await page.waitForURL(/\/dashboard/);
  expect((await page.context().cookies()).find(cookie=>cookie.name==='microbank_session')).toMatchObject({secure:true,httpOnly:true});
  await page.goto('/customers');
  await expect(page.getByRole('heading',{name:'Customer Management'})).toBeVisible();
}
async function search(page: Page, name: string) {
  await page.getByRole('textbox',{name:'Search records'}).fill(name);
}
async function review(page: Page, summary: string, decision='approved') {
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await page.getByRole('button',{name:'Customer approvals',exact:true}).click();
  await search(page,summary);
  const row=page.getByRole('row').filter({hasText:summary}).filter({has:page.getByRole('button',{name:'Review request',disabled:false})});
  await row.getByRole('button',{name:'Review request'}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByLabel('Decision *').selectOption(decision);
  await dialog.getByLabel('Review notes *').fill(decision==='rejected'?'Please verify the address':'Verified original documents');
  await dialog.getByRole('button',{name:'Record decision'}).click();
  await expect(dialog).not.toBeVisible();
}
async function currentRow(page: Page, name: string, status: string) {
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await search(page,name);
  const row=page.getByRole('row').filter({hasText:name});
  await expect(row.getByText(status,{exact:true})).toBeVisible();
  return row;
}

test('authenticated customer interface completes approval, editing, rejection and deactivation',async({page,newActorPage},testInfo)=>{
  await login(page,'agent@example.test');
  const manager=await newActorPage();await login(manager,'manager@example.test');
  await page.getByRole('button',{name:'Register customer',exact:true}).click();
  const form=page.getByRole('dialog');
  await form.getByLabel('Full name *',{exact:true}).fill('Browser Customer');
  await form.getByLabel('National Identity Card number *').fill('200101230987');
  await form.getByLabel('Date of birth *').fill('2001-01-23');
  await form.getByLabel('Mobile number *').fill('0771234567');
  await form.getByLabel('Residential address *').fill('12 Browser Test Road');
  await form.getByRole('button',{name:'Submit registration'}).click();
  await expect(form).not.toBeVisible();
  const pending=await currentRow(page,'Browser Customer','Pending');
  await expect(pending.getByRole('button',{name:'Edit Browser Customer',exact:true})).toBeDisabled();
  await review(manager,'Register Browser Customer');
  const active=await currentRow(page,'Browser Customer','Active');
  await active.getByRole('button',{name:'Edit Browser Customer',exact:true}).click();
  await form.getByLabel('Full name *',{exact:true}).fill('Browser Customer Updated');
  await form.getByRole('button',{name:'Submit changes'}).click();
  await expect(form).not.toBeVisible();
  await expect(page.getByText('Change awaiting approval')).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit Browser Customer',exact:true})).toBeDisabled();
  await review(manager,'Update details for Browser Customer');
  const updated=await currentRow(page,'Browser Customer Updated','Active');
  await updated.getByRole('button',{name:'Edit Browser Customer Updated',exact:true}).click();
  await form.getByLabel('Residential address *').fill('Unverified changed address');
  await form.getByRole('button',{name:'Submit changes'}).click();
  await expect(form).not.toBeVisible();
  await review(manager,'Update details for Browser Customer Updated','rejected');
  await currentRow(page,'Browser Customer Updated','Active');
  await page.getByRole('button',{name:'View Browser Customer Updated',exact:true}).click();
  await expect(form.getByText('12 Browser Test Road',{exact:true})).toBeVisible();
  await expect(form.getByText('Review notes: Please verify the address')).toBeVisible();
  await form.getByRole('button',{name:'Request status change'}).click();
  await form.getByLabel('New status *').selectOption('inactive');
  await form.getByLabel('Reason *').fill('Customer requested deactivation');
  await form.getByRole('button',{name:'Submit request'}).click();
  await expect(form).not.toBeVisible();
  await review(manager,'Deactivate Browser Customer Updated');
  await currentRow(page,'Browser Customer Updated','Inactive');
  await page.screenshot({path:testInfo.outputPath('customer-desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'View Browser Customer Updated',exact:true}).click();
  await expect(form.getByRole('button',{name:'Request status change'})).toBeEnabled();
  await page.screenshot({path:testInfo.outputPath('customer-mobile.png'),fullPage:true});
  await page.keyboard.press('Escape');
  await expect(form).not.toBeVisible();
});

test('real sessions cannot read or mutate another branch using forged IDs or roles',async({page,newActorPage})=>{
  await login(page,'kandy.agent@example.test');
  const manager=await newActorPage();await login(manager,'kandy.manager@example.test');
  for(const actor of [page,manager]) {
    const result=await actor.evaluate(async()=>{
      const data=await (await fetch('/api/bootstrap')).json();
      return {customers:data.customers,approvals:data.approvals};
    });
    expect(result.customers.every((row:{branch_id:number})=>row.branch_id===2)).toBe(true);
    expect(result.approvals.every((row:{branch_id:number})=>row.branch_id===2)).toBe(true);
    expectHttpError(actor,'/api/actions',403);
    const responses=await actor.evaluate(async()=>{
      const bodies=[{action:'customer.update',id:1,userRole:'admin'},
        {action:'customer.status',id:1,status:'inactive',reason:'Forged request'},
        {action:'approval.review',id:1,decision:'approved',notes:'Forged approval'}];
      return Promise.all(bodies.map(async body=>(await fetch('/api/actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status));
    });
    expect(responses).toEqual([403,403,403]);
  }
});
