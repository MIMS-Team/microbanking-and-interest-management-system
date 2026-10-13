import pg from 'pg';
import {postgresStatement} from './postgres-sql.mjs';

export function postgresConfig(connectionString=process.env.DATABASE_URL) {
  if(!connectionString)throw new Error('DATABASE_URL is required for PostgreSQL.');
  const url=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Use a PostgreSQL connection string.');
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  const mode=url.searchParams.get('sslmode');
  if(!local && !['require','verify-ca','verify-full'].includes(mode??''))throw new Error('Remote PostgreSQL connections require TLS in the connection string.');
  // pg treats sslmode=require as encryption without certificate verification.
  // Keep verification enabled and preserve channel binding for Neon.
  url.searchParams.delete('sslmode');url.searchParams.delete('channel_binding');
  const max=Number(process.env.DB_POOL_MAX||5);
  if(!Number.isInteger(max)||max<1||max>30)throw new Error('DB_POOL_MAX must be between 1 and 30.');
  return {connectionString:url.toString(),ssl:local&&!mode||local&&mode==='disable'?false:{rejectUnauthorized:true},
    enableChannelBinding:connectionString.includes('channel_binding=require'),max,
    connectionTimeoutMillis:15000,idleTimeoutMillis:30000};
}

// IDs must retain the application's safe integer contract. NUMERIC is left as
// text so monetary arithmetic never passes through floating point in the driver.
const types=new pg.TypeOverrides();
types.setTypeParser(20,value=>{const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('Database integer exceeds the supported range.');return n;});
types.setTypeParser(1082,value=>value);
types.setTypeParser(1114,value=>value.replace(' ','T')+'Z');
types.setTypeParser(1184,value=>new Date(value).toISOString());

export function createPostgresPool(connectionString) {
  const pool=new pg.Pool({...postgresConfig(connectionString),types});
  // Never log connection strings or native errors containing query parameters.
  pool.on('error',()=>console.error('An idle PostgreSQL connection was lost; the pool will reconnect.'));
  return pool;
}

/** Existing authentication callbacks consume mysql2-shaped tuples, not a wire
 * protocol. This facade keeps that result contract while executing only pg.
 * PostgreSQL banking migrations and administration use native pg clients.
 */
export function relationalPostgresPool(pool) {
  const wrap=(client,isConnection=false)=>{
    let transaction=false;
    let pending=Promise.resolve();
    const execute=async(sql,params=[])=>{
      if(/^SET time_zone/i.test(sql))return [{affectedRows:0},[]];
      // The service requests READ COMMITTED immediately before BEGIN.
      if(/^SET TRANSACTION ISOLATION LEVEL/i.test(sql)&&!transaction)return [{affectedRows:0},[]];
      const {statement,values}=postgresStatement(sql,params);
      // These two callers deliberately recover from a unique conflict inside
      // the same transaction. A savepoint prevents PostgreSQL's aborted TX.
      const recoverable=transaction&&/^INSERT INTO (money_operations|interest_runs)\b/i.test(statement);
      if(recoverable)await client.query('SAVEPOINT banking_insert');
      try {
        const result=await client.query(statement,values);
        if(recoverable)await client.query('RELEASE SAVEPOINT banking_insert');
        const write=['INSERT','UPDATE','DELETE'].includes(result.command);
        return [write?{insertId:result.rows[0]?.id??0,affectedRows:result.rowCount}:result.rows,[]];
      }catch(error){
        if(recoverable){await client.query('ROLLBACK TO SAVEPOINT banking_insert');await client.query('RELEASE SAVEPOINT banking_insert');}
        const codes={'23505':'ER_DUP_ENTRY','23503':'ER_NO_REFERENCED_ROW_2','23514':'ER_CHECK_CONSTRAINT_VIOLATED','P0001':'ER_SIGNAL_EXCEPTION'};
        if(codes[error.code])error.code=codes[error.code];
        throw error;
      }
    };
    const query=(sql,params=[])=>{
      if(!isConnection)return execute(sql,params);
      const result=pending.then(()=>execute(sql,params));
      pending=result.then(()=>undefined,()=>undefined);return result;
    };
    return {query,execute:query,
      beginTransaction:async()=>{await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');transaction=true;},
      commit:async()=>{await pending;await client.query('COMMIT');transaction=false;},
      rollback:async()=>{await pending;await client.query('ROLLBACK');transaction=false;},
      release:()=>{if(isConnection)client.release();},
    };
  };
  return {...wrap(pool),getConnection:async()=>wrap(await pool.connect(),true),end:()=>pool.end(),native:pool};
}
