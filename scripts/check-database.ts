import { getDb } from "../lib/db";
import { existsSync } from "node:fs";

// Match Next.js and db-setup so a configured PostgreSQL URL is respected.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const database = await getDb();
try {
  const result = await database.query("SELECT count(*) AS staff_count FROM staff");
  console.log("PostgreSQL connection is ready:", result.rows[0]);
} finally {
  await database.close();
}
