// Compatibility entry point; never reads runtime/shared database settings.
import mysql from 'mysql2/promise';
import {preflightDatabase} from './database-preflight.mjs';
const {PREFLIGHT_DB_HOST:host,PREFLIGHT_DB_USER:user,PREFLIGHT_DB_PASSWORD:password,PREFLIGHT_DB_NAME:database}=process.env;
if(!host||!user||password===undefined||!database) throw new Error('Explicit read-only PREFLIGHT_DB_* credentials required.');
const connection=await mysql.createConnection({host,user,password,database,port:Number(process.env.PREFLIGHT_DB_PORT||3306),dateStrings:true});
try {const report=await preflightDatabase(connection);console.log(JSON.stringify(report,null,2));if(report.findings.length)process.exitCode=1;}
finally {await connection.end();}
