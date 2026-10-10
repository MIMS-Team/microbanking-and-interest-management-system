import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const url = process.env.APP_URL || 'http://127.0.0.1:3000';
const key = process.env.SCHEDULER_KEY;
if (!key || key.length < 32) throw new Error('Set SCHEDULER_KEY to at least 32 random characters.');
const backupTime = process.env.BACKUP_TIME_COLOMBO;
if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(backupTime ?? '')) throw new Error('Configure BACKUP_TIME_COLOMBO explicitly.');
let running = false, maintenanceDay = '', backupDay = '';
const once = process.argv.includes('--once');
async function runJobs() {
  if (running) return;
  running = true;
  try {
    const local = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    const [day, time] = local.split(' ');
    if (!once && time < backupTime) return;
    if (maintenanceDay !== day) {
      try {
        const response = await fetch(`${url}/api/maintenance`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10 * 60 * 1000) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Maintenance failed.');
        console.log(new Date().toISOString(), result.message);
        maintenanceDay = day;
      } catch (error) { console.error('Maintenance:', error.message); if (once) process.exitCode = 1; }
    }
    // Policy-blocked maintenance must not prevent an independently valid backup.
    if (backupDay !== day) {
      try {
        await new Promise((resolve, reject) => {
          const child = spawn(process.execPath, ['scripts/database-backup.mjs'], { env: process.env, windowsHide: true, stdio: 'inherit' });
          child.on('error', reject);
          child.on('exit', code => code === 0 ? resolve() : reject(new Error('Backup failed.')));
        });
        backupDay = day;
      } catch (error) { console.error('Backup:', error.message); if (once) process.exitCode = 1; }
    }
  } finally { running = false; }
}
await runJobs();
if (!once) setInterval(runJobs, 60000);
