// Compatibility entry point. Authentication and banking now install one schema.
import { migrateDatabase, runMigration } from './migrate-database.mjs';
import { pathToFileURL } from 'node:url';
export async function migrateAuthTables(connection, {importSqlite=false}={}) {
  if(importSqlite) throw new Error('Implicit SQLite import is disabled. Prepare and review an explicit credential/data migration; normal installation never reads developer data.');
  await migrateDatabase(connection);
}
export {runMigration};
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) runMigration().catch(error=>{console.error(error.message);process.exitCode=1;});
