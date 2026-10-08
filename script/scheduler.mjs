// Keep Next.js running. Call its API so only that server opens the database.
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.APP_URL || "http://127.0.0.1:3000";
const key = process.env.SCHEDULER_KEY;
if (!key || key.length < 32) throw new Error("Set SCHEDULER_KEY to at least 32 random characters in .env.local.");

async function runJobs() {
  try {
    const response = await fetch(`${url}/api/maintenance`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Maintenance failed.");
    console.log(new Date().toISOString(), result.message, result.details);
  } catch (error) {
    console.error(new Date().toISOString(), error.message);
    if (process.argv.includes("--once")) process.exitCode = 1;
  }
}

await runJobs();
if (!process.argv.includes("--once")) {
  console.log("Maintenance runs every 24 hours while this process is running.");
  setInterval(runJobs, 24 * 60 * 60 * 1000);
}
