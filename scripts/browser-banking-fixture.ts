// Imported only by an owned browser harness after its CREATE DATABASE.
import type {Connection,ResultSetHeader} from 'mysql2/promise';
import {seedBankingFixture,fixturePolicies} from '../tests/fixtures/banking-seed';
import {bind} from '../lib/db';
import type {Queryable} from '../lib/db';
export async function seedBrowserBanking(connection:Connection){
  const adapter:Queryable={query:async<T>(sql:string,params:unknown[]=[])=>{const bound=bind(sql,params),[result]=await connection.query(bound.statement,bound.values);if(Array.isArray(result))return {rows:result as T[]};const header=result as ResultSetHeader;return {rows:(header.insertId?[{id:header.insertId}]:[]) as T[],insertId:header.insertId};}};
  await seedBankingFixture(adapter);
  const names=['agent','manager','admin','higher','other-agent','other-manager'];
  for(let id=1;id<=names.length;id++)await connection.query('UPDATE staff SET email=?,full_name=? WHERE id=?',[`bank-${names[id-1]}@example.test`,`Fictional Browser ${names[id-1]}`,id]);
  await connection.query("UPDATE customers SET full_name=CONCAT('Fictional Customer ',id),email=CONCAT('customer-',id,'@example.test')");
  for(let day=0;day<7;day++)await connection.query("INSERT INTO branch_hours(branch_id,weekday,opens,closes) SELECT id,?,'00:00:00','23:59:59' FROM branches",[day]);
  // A pre-approved fictional contract is already due, so maturity/renewal can
  // be verified in the browser without editing live records or changing time.
  const [customer]=await connection.query<ResultSetHeader>(`INSERT INTO customers(customer_number,full_name,nic,date_of_birth,address,mobile,email,branch_id,agent_id,status,created_at)
    VALUES('CUS-BROWSER-MATURED','Fictional Mature Contract Owner','198099990001','1980-01-01','Fictional historical fixture','0770000000','mature-customer@example.test',1,1,'active',UTC_TIMESTAMP()-INTERVAL 5 MONTH)`);
  const [account]=await connection.query<ResultSetHeader>(`INSERT INTO savings_accounts(account_number,branch_id,agent_id,rate_id,minimum_balance,balance,status,opened_at)
    VALUES('SA-BROWSER-MATURED',1,1,1,500,0,'pending',UTC_TIMESTAMP()-INTERVAL 5 MONTH)`);
  await connection.query('INSERT INTO customer_accounts(customer_id,account_id,owner_slot) VALUES(?,?,1)',[customer.insertId,account.insertId]);
  await connection.query('INSERT INTO ownership_history(account_id,customer_id,valid_from) VALUES(?,?,UTC_TIMESTAMP()-INTERVAL 5 MONTH)',[account.insertId,customer.insertId]);
  const [opening]=await connection.query<ResultSetHeader>("INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description,created_at) VALUES('BT-BROWSER-OLD-OPEN',1,'browser-old-opening','fictional-browser-opening','deposit','Fictional historical opening',UTC_TIMESTAMP()-INTERVAL 5 MONTH)");
  await connection.query("INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after,created_at) VALUES(?,?,'deposit',50000,0,50000,UTC_TIMESTAMP()-INTERVAL 5 MONTH)",[opening.insertId,account.insertId]);
  await connection.query("UPDATE savings_accounts SET balance=50000,status='active' WHERE id=?",[account.insertId]);
  const [deposit]=await connection.query<ResultSetHeader>(`INSERT INTO fixed_deposits(fd_number,source_account_id,rate_id,principal,annual_rate,term_months,status,auto_renew,opened_at,maturity_date)
    VALUES('FD-BROWSER-DUE',?,2,10000,8,3,'active',1,DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)-INTERVAL 4 MONTH-INTERVAL 330 MINUTE,DATE(UTC_TIMESTAMP()+INTERVAL 330 MINUTE)-INTERVAL 1 MONTH)`,[account.insertId]);
  const [operation]=await connection.query<ResultSetHeader>("INSERT INTO money_operations(reference,actor_id,idempotency_key,request_fingerprint,type,description,created_at) VALUES('BT-BROWSER-DUE',1,'browser-due-contract','fictional-browser-due','fd_open','Fictional approved maturity fixture',UTC_TIMESTAMP()-INTERVAL 4 MONTH)");
  await connection.query("INSERT INTO ledger_entries(operation_id,account_id,type,amount,balance_before,balance_after,created_at) SELECT ?,id,'fd_open',-10000,balance,balance-10000,UTC_TIMESTAMP()-INTERVAL 4 MONTH FROM savings_accounts WHERE id=?",[operation.insertId,account.insertId]);
  await connection.query('UPDATE savings_accounts SET balance=balance-10000 WHERE id=?',[account.insertId]);
  await connection.query("INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES(4,'demo.seed','fixed_deposit',?,?)",[deposit.insertId,JSON.stringify({description:'Fictional, pre-approved contract for browser renewal verification'})]);
  return {...fixturePolicies,CASH_CORRECTION_POLICY:'independent-management-active-cash'};
}
