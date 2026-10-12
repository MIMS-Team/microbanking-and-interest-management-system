import { createServer as createHttpServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

export async function createLocalMailbox({ inboxPort = 8025 } = {}) {
  const messages = [];
  const sockets = new Set();
  const smtp = createTcpServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setTimeout(15_000, () => socket.destroy());
    socket.setEncoding('utf8');
    socket.write('220 mims-local-fictional-inbox ESMTP\r\n');

    let buffer = '';
    let data = null;
    let recipients = [];
    socket.on('data', (chunk) => {
      buffer += chunk;
      if (buffer.length > 1024 * 1024) return socket.destroy();
      let end;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data !== null) {
          if (line === '.') {
            if (messages.length >= 200) messages.shift();
            messages.push({ received: new Date().toISOString(), recipients: [...recipients], raw: data.join('\r\n') });
            data = null;
            recipients = [];
            socket.write('250 Message accepted locally\r\n');
          } else {
            data.push(line.replace(/^\.\./, '.'));
            if (data.length > 10_000) return socket.destroy();
          }
        } else if (/^(EHLO|HELO) /i.test(line)) socket.write('250 mims-local-inbox\r\n');
        else if (/^MAIL FROM:/i.test(line)) { recipients = []; socket.write('250 OK\r\n'); }
        else if (/^RCPT TO:/i.test(line)) {
          const recipient = line.match(/<([^>]+)>/)?.[1];
          if (!recipient || !/@(?:btrust\.local|example\.test)$/i.test(recipient)) socket.write('550 Fictional local recipients only\r\n');
          else { recipients.push(recipient); socket.write('250 OK\r\n'); }
        } else if (/^DATA$/i.test(line) && recipients.length) { data = []; socket.write('354 End with dot\r\n'); }
        else if (/^QUIT$/i.test(line)) socket.end('221 Bye\r\n');
        else if (/^(RSET|NOOP)$/i.test(line)) { recipients = []; data = null; socket.write('250 OK\r\n'); }
        else socket.write('502 Unsupported command\r\n');
      }
    });
  });

  const inbox = createHttpServer((request, response) => {
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/messages') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(messages));
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    const mail = messages.toReversed().map((message) =>
      `<article><h2>${escapeHtml(message.recipients.join(', '))}</h2><small>${escapeHtml(message.received)}</small><pre>${escapeHtml(message.raw.replace(/=\r?\n/g, '').replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))))}</pre></article>`
    ).join('');
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MIMS local inbox</title><style>body{font-family:system-ui;max-width:960px;margin:32px auto;padding:16px;background:#f6f8fb;color:#1c2b3e}article{background:white;border:1px solid #dde3eb;padding:20px;margin-top:20px;border-radius:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}button{padding:10px 18px}h1{color:#08254a}</style><h1>MIMS local email inbox</h1><p>OTP codes and invitations for fictional employees. Messages stay in memory; no email leaves this computer.</p><form><button>Refresh inbox</button></form>${mail || '<p>No messages yet. Sign in to the application to receive an OTP.</p>'}</html>`);
  });

  let smtpPort;
  let resolvedInboxPort;
  try {
    smtpPort = await listen(smtp);
    resolvedInboxPort = await listen(inbox, inboxPort);
  } catch (error) {
    sockets.forEach((socket) => socket.destroy());
    if (smtp.listening) await close(smtp);
    if (inbox.listening) await close(inbox);
    throw error;
  }

  return {
    smtpPort,
    inboxPort: resolvedInboxPort,
    inboxURL: `http://127.0.0.1:${resolvedInboxPort}`,
    close: async () => {
      sockets.forEach((socket) => socket.destroy());
      await Promise.all([smtp, inbox].filter((server) => server.listening).map(close));
      messages.length = 0;
    },
  };
}
