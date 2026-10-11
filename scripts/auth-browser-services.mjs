// Test-harness services only. None of these controls are imported by the app.
import { createServer as tcpServer } from 'node:net';
import { createServer as httpServer, request as httpRequest } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { randomBytes, scryptSync } from 'node:crypto';
import mysql from 'mysql2/promise';
import { migrateAuthTables } from './migrate-auth-mysql.mjs';
import {fictionalPrincipals,provisionPrincipals} from './database-principals.mjs';

export async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

export async function close(server) {
  server.closeAllConnections?.();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

export async function disposableDatabase({banking=false,load=false}={}) {
  const { TEST_MYSQL_HOST: host, TEST_MYSQL_USER: user, TEST_MYSQL_PASSWORD: password } = process.env;
  if (!host || !user || password === undefined) {
    throw new Error('Production browser verification requires TEST_MYSQL_HOST/USER/PASSWORD; it never falls back to a shared application database.');
  }
  const port = Number(process.env.TEST_MYSQL_PORT || 3306);
  const connection = await mysql.createConnection({ host, port, user, password });
  const name = `mims_test_disposable_browser_${randomBytes(12).toString('hex')}`;
  let created = false;
  const createdPrincipals=[];let principalHost='localhost';
  async function dispose() {
    try {
      if (created && /^mims_test_disposable_browser_[a-f0-9]{24}$/.test(name)) {
        await connection.query(`DROP DATABASE \`${name}\``);
        created = false;
      }
      for(const name of createdPrincipals)await connection.query('DROP USER '+connection.escape(name)+'@'+connection.escape(principalHost));
      createdPrincipals.length=0;
    } finally { await connection.end(); }
  }
  try {
    // A collision fails; this invocation never adopts an existing database.
    await connection.query(`CREATE DATABASE \`${name}\``);
    created = true;
    await connection.changeUser({ database: name });
    await migrateAuthTables(connection, { importSqlite: false });
    const principals=fictionalPrincipals();
    const [[client]]=await connection.query("SELECT SUBSTRING_INDEX(USER(),'@',-1) AS host");principalHost=client.host;
    await provisionPrincipals(connection,{database:name,host:principalHost,...principals},user=>createdPrincipals.push(user));
    const applicationEnv={DB_HOST:host,DB_PORT:String(port),DB_USER:principals.application.user,DB_PASSWORD:principals.application.password,DB_NAME:name};
    if(banking){
      const {tsImport}=await import('tsx/esm/api');
      const {seedBrowserBanking}=await tsImport('./browser-banking-fixture.ts',import.meta.url);
      const policies=await seedBrowserBanking(connection);
      let loadFixture;
      if(load){const {seedHttpLoad}=await tsImport('./http-load-fixture.ts',import.meta.url);loadFixture=await seedHttpLoad(connection);}
      return {name,dispose,loadFixture,unavailableLimiter:async(callback)=>{
        if(!created)throw new Error('Owned limiter fixture is no longer available.');
        const [[identity]]=await connection.query('SELECT DATABASE() AS name');if(identity.name!==name)throw new Error('Owned limiter fixture identity mismatch.');
        await connection.query('RENAME TABLE http_rate_events TO fictional_unavailable_rate_events');
        try{return await callback();}finally{await connection.query('RENAME TABLE fictional_unavailable_rate_events TO http_rate_events');}
      },reconcile:async()=>{
        const [[totals]]=await connection.query('SELECT COUNT(*) AS mismatches FROM (SELECT a.id FROM savings_accounts a LEFT JOIN ledger_entries l ON l.account_id=a.id GROUP BY a.id,a.balance HAVING a.balance<>COALESCE(SUM(l.amount),0)) differences');
        if(totals.mismatches)throw new Error('Workload ledger reconciliation failed.');
        return {balance_mismatches:Number(totals.mismatches)};
      },env:{...policies,...applicationEnv}};
    }
    await connection.query("INSERT INTO branches(id,code,name) VALUES(1,'BROWSER','Fictional browser branch')");
    const salt = randomBytes(16).toString('hex');
    const hash = `${salt}:${scryptSync('ProductionFixture!2026', salt, 64).toString('hex')}`;
    const [row] = await connection.execute(
      'INSERT INTO staff (full_name,email,password_hash,role,branch_id,status) VALUES (?,?,?,?,?,?)',
      ['Fictional Production Browser Agent', 'production-agent@example.test', hash, 'agent', 1, 'active'],
    );
    await connection.execute('INSERT INTO staff_authentication (employee_id,password_hash) VALUES (?,?)', [row.insertId, hash]);
    return { name, dispose, env: applicationEnv };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export async function smtpMailbox() {
  const messages = [];
  const sockets = new Set();
  const token = randomBytes(32).toString('hex');
  // Minimal local SMTP sink: real Nodemailer SMTP delivery, no relay, AUTH,
  // STARTTLS, disk capture or outbound connections. Bind loopback only.
  const smtp = tcpServer(socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(15000, () => socket.destroy());
    socket.setEncoding('utf8');
    socket.write('220 fictional-mailbox ESMTP\r\n');
    let buffer = '', data = null, recipients = [];
    socket.on('data', chunk => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) return socket.destroy();
      let end;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data !== null) {
          if (line === '.') {
            messages.push({ id: messages.length + 1, recipients, raw: data.join('\r\n') });
            data = null; recipients = [];
            socket.write('250 Message accepted\r\n');
          } else {
            data.push(line.replace(/^\.\./, '.'));
            if (data.length > 10000) return socket.destroy();
          }
        } else if (/^(EHLO|HELO) /i.test(line)) socket.write('250 fictional-mailbox\r\n');
        else if (/^MAIL FROM:/i.test(line)) { recipients = []; socket.write('250 OK\r\n'); }
        else if (/^RCPT TO:/i.test(line)) {
          const recipient = line.match(/<([^>]+)>/)?.[1];
          if (!recipient?.endsWith('@example.test')) socket.write('550 Only fictional recipients accepted\r\n');
          else { recipients.push(recipient); socket.write('250 OK\r\n'); }
        } else if (/^DATA$/i.test(line) && recipients.length) { data = []; socket.write('354 End with dot\r\n'); }
        else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
        else if (/^(RSET|NOOP)$/i.test(line)) { recipients = []; socket.write('250 OK\r\n'); }
        else socket.write('502 Unsupported command\r\n');
      }
    });
  });
  const smtpPort = await listen(smtp);
  const api = httpServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(messages));
  });
  let apiPort;
  try { apiPort = await listen(api); }
  catch (error) { await close(smtp); throw error; }
  return {
    smtpPort, apiURL: `http://127.0.0.1:${apiPort}`, token,
    dispose: async () => { sockets.forEach(socket => socket.destroy()); await close(smtp); await close(api); messages.length = 0; },
  };
}

export async function httpsProxy({ key, cert, appPort }) {
  const server = httpsServer({ key, cert }, (req, res) => {
    const headers = { ...req.headers };
    // Model an owned TLS terminator. Never append to untrusted forwarding data.
    delete headers.forwarded;
    delete headers['x-real-ip'];
    headers['x-forwarded-for'] = req.socket.remoteAddress || '127.0.0.1';
    headers['x-forwarded-proto'] = 'https';
    headers['x-forwarded-host'] = req.headers.host;
    const upstream = httpRequest({ hostname: '127.0.0.1', port: appPort, path: req.url, method: req.method, headers }, response => {
      if (res.destroyed) { response.destroy(); return; }
      res.writeHead(response.statusCode, response.headers);
      response.on('error', () => res.destroy());
      response.pipe(res);
    });
    upstream.on('error', () => {
      // A navigation or runner shutdown may interrupt an already-streaming
      // response. Never send a second set of headers (which crashes cleanup).
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) res.destroy();
      else res.writeHead(502).end('Owned app unavailable');
    });
    req.on('error', () => upstream.destroy());
    res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  });
  const port = await listen(server);
  // Same non-loopback hostname, plain HTTP: the browser must withhold Secure
  // cookies. This sink does not proxy or expose an insecure login endpoint.
  const insecure = httpServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ cookie: req.headers.cookie || '' }));
  });
  let httpPort;
  try { httpPort = await listen(insecure); }
  catch (error) { await close(server); throw error; }
  return { port, httpPort, dispose: async () => { await close(server); await close(insecure); } };
}
