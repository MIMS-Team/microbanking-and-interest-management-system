// Explicit migration command; never invoked from application startup.
import { runMigration } from './migrate-database.mjs';
import {runPostgresMigration} from './migrate-postgres.mjs';
const envFile=process.argv.find(a=>a.startsWith('--env-file='))?.slice(11);
if(envFile)process.loadEnvFile(envFile);
if(process.env.MIGRATION_DATABASE_URL)await runPostgresMigration();
else await runMigration();
