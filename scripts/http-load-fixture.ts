import type {Connection,ResultSetHeader} from 'mysql2/promise';
import {passwordHash} from '../lib/server/auth';
import {createHash} from 'node:crypto';
export async function seedHttpLoad(connection:Connection){
  const password='FictionalLoad!2026',hash=passwordHash(password),users=[];
  for(let i=0;i<70;i++){
    const role=i<40?'agent':i<60?'manager':'higher_manager',email=`load-${i}@example.test`;
    const [row]=await connection.query<ResultSetHeader>('INSERT INTO staff(full_name,email,password_hash,role,branch_id) VALUES(?,?,?,?,?)',[`Fictional Load ${i}`,email,hash,role,role==='higher_manager'?null:1]);
    users.push({id:row.insertId,email,role,accountId:0,customerId:0,destinationId:0});
  }
  const customers=[],accounts=[];for(let i=0;i<700;i++){
    const agent=users[i%40];customers.push([`LOAD-C-${i}`,`Fictional Load Customer ${i}`,String(210000000000+i),'1980-01-01','Fictional load address','0770000000','',`load-c-${i}@example.test`,1,agent.id,'active']);
    accounts.push([`LOAD-A-${i}`,1,agent.id,1,'500.00','0.00','pending']);
  }
  const [cs]=await connection.query<ResultSetHeader>('INSERT INTO customers(customer_number,full_name,nic,date_of_birth,address,mobile,landline,email,branch_id,agent_id,status) VALUES ?',[customers]);
  const [ac]=await connection.query<ResultSetHeader>('INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,minimum_balance,balance,status) VALUES ?',[accounts]);
  const owners=Array.from({length:700},(_,i)=>[cs.insertId+i,ac.insertId+i,1]);await connection.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES ?',[owners]);
  await connection.query('INSERT INTO ownership_history(account_id,customer_id,valid_from) SELECT account_id,customer_id,UTC_TIMESTAMP(3) FROM customer_accounts WHERE account_id>=?',[ac.insertId]);
  const operations=[],entries=[];for(let i=0;i<700;i++)for(let event=0;event<10;event++){const key=`load-seed-${i}-${event}`;operations.push([`BT-${key}`,users[i%40].id,key,createHash('sha256').update(key).digest('hex'),'deposit','Fictional load history']);}
  const [ops]=await connection.query<ResultSetHeader>('INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description) VALUES ?',[operations]);
  for(let i=0;i<700;i++)for(let event=0;event<10;event++)entries.push([ops.insertId+i*10+event,ac.insertId+i,'deposit','10000.00',String(event*10000),String((event+1)*10000)]);
  await connection.query('INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after) VALUES ?',[entries]);
  await connection.query("UPDATE savings_accounts SET balance=100000,status='active' WHERE id>=?",[ac.insertId]);
  for(let i=0;i<40;i++){users[i].accountId=ac.insertId+i;users[i].customerId=cs.insertId+i;users[i].destinationId=ac.insertId+40+i;}
  await connection.query("INSERT INTO audit_logs(actor_id,action,entity_type,details) VALUES(3,'demo.seed','system',?)",[JSON.stringify({description:'Fictional authenticated workload: 70 employees, 700 customers/accounts and 7000 ledger records'})]);
  const [[counts]]=await connection.query<import('mysql2').RowDataPacket[]>('SELECT (SELECT COUNT(*) FROM staff) AS employees,(SELECT COUNT(*) FROM customers) AS customers,(SELECT COUNT(*) FROM savings_accounts) AS accounts,(SELECT COUNT(*) FROM ledger_entries) AS ledger_entries');
  return {users,password,counts};
}
