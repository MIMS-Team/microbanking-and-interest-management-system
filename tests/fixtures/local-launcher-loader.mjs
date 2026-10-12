// Execute the real launcher with disposable files, without starting Next.js or MySQL.
const sources = {
  'mysql2/promise': `
    export default { async createConnection(config) {
      if (config.host === 'unreachable.example.test') throw Object.assign(new Error('Fixture connection refused'), { code: 'ECONNREFUSED' });
      return {
        async query(sql) {
          if (sql.includes('DATABASE()')) return [[{ name: config.database }]];
          if (sql.includes('schema_migrations')) return [[{ completed: 11 }]];
          if (sql.includes('FROM staff')) return [[{ employees: 6 }]];
          throw new Error('Unexpected fixture query: ' + sql);
        },
        async end() {},
      };
    } };
  `,
  'node:child_process': `
    import { EventEmitter } from 'node:events';
    import { writeFileSync } from 'node:fs';
    export function spawn(command, args, options) {
      const keys = ['DB_NAME', 'MIMS_AUTH_DB_ADAPTER', 'MIMS_AUTH_DB_PATH', 'MIMS_TEST_SENTINEL', 'APP_URL'];
      const environment = Object.fromEntries(keys.filter(key => options.env[key] !== undefined).map(key => [key, options.env[key]]));
      writeFileSync('launcher-child.json', JSON.stringify({ command, args, environment }));
      const child = new EventEmitter();
      Object.assign(child, { pid: 12345, exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() });
      setTimeout(() => child.stdout.emit('data', Buffer.from('Ready in 1ms\\n')), 0);
      setTimeout(() => { child.exitCode = 0; child.emit('exit', 0); }, 20);
      return child;
    }
    export function spawnSync() { throw new Error('Unexpected process termination in launcher fixture'); }
  `,
  './local-mailbox.mjs': `
    export async function createLocalMailbox({ inboxPort }) {
      return { smtpPort: 2525, inboxURL: 'http://127.0.0.1:' + inboxPort, async close() {} };
    }
  `,
};

export async function resolve(specifier, context, nextResolve) {
  if (Object.hasOwn(sources, specifier)) {
    return { url: 'data:text/javascript,' + encodeURIComponent(sources[specifier]), shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
