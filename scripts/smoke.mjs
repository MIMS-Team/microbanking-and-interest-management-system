// Smoke verification owns its MySQL database, HTTPS server and SMTP service.
process.env.AUTH_VERIFY_SMOKE='1';
await import('./run-auth-production-e2e.mjs');
