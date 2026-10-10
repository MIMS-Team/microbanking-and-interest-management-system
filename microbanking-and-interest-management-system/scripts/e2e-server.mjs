import { createServer } from 'node:http';
import next from 'next';
import { requireE2eTarget } from './auth-test-environment.mjs';

requireE2eTarget();
let handler = (_request, response) => { response.writeHead(503).end(); };
const server = createServer((request, response) => handler(request, response));
// Bind atomically to an OS-selected free loopback port. Never connect to port 3000.
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const app = next({
  dev: true, hostname: '127.0.0.1', port, httpServer: server, webpack: true,
  conf: { distDir: `.next/e2e/${process.env.MIMS_AUTH_E2E_RUN_ID}` },
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.closeAllConnections();
  server.close();
  await app.close();
  process.exit(process.exitCode || 0);
}
process.on('message', (message) => { if (message === 'shutdown') void close(); });
process.on('disconnect', () => void close());
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
try {
  await app.prepare();
  handler = app.getRequestHandler();
  process.send?.({ baseURL: `http://127.0.0.1:${port}` });
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  await close();
}
