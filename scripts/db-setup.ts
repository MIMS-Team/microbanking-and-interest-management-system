// Explicit migration command; never invoked from application startup.
import { runMigration } from './migrate-database.mjs';
await runMigration();
