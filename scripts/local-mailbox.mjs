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

const inboxRoles = [
  ['all', 'All roles'], ['admin', 'Administrator'], ['higher_manager', 'Higher Manager'],
  ['manager', 'Branch Manager'], ['agent', 'Agent'], ['unassigned', 'Other recipients'],
];

function readMail(raw) {
  const split = raw.indexOf('\r\n\r\n');
  const headers = (split < 0 ? raw : raw.slice(0, split)).replace(/\r\n[ \t]+/g, ' ');
  let body = split < 0 ? '' : raw.slice(split + 4);
  if (/^Content-Transfer-Encoding:\s*quoted-printable/im.test(headers)) {
    body = body.replace(/=\r?\n/g, '');
    body = Buffer.from(body.replace(/=([a-f0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8');
  } else if (/^Content-Transfer-Encoding:\s*base64/im.test(headers)) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }
  const subject = headers.match(/^Subject:\s*(.*)$/im)?.[1] || 'Local email';
  const approval = /employee[ _](creation|deactivation)|approval/i.test(subject);
  const code = body.match(/(?:verification code is:|\bcode\b[^\r\n]*?\bis)\s*(\d{6})\b/i)?.[1];
  const sentAt = Date.parse(headers.match(/^Date:\s*(.*)$/im)?.[1] || '');
  return { subject, body, approval, code, sentAt };
}

function mailboxPage(messages, directory, role, section, directoryError) {
  const roles = new Map(directory.map(person => [person.email.toLowerCase(), person.role]));
  const mail = messages.toReversed().map(message => ({ ...message, ...readMail(message.raw) }));
  const belongsTo = (message, selectedRole) => selectedRole === 'all' || message.recipients.some(email =>
    (roles.get(email.toLowerCase()) || 'unassigned') === selectedRole);
  const visible = mail.filter(message => belongsTo(message, role));
  const link = (selectedRole, selectedSection) => `/?${new URLSearchParams({ role: selectedRole, section: selectedSection })}`;
  const roleLinks = inboxRoles.map(([key, label]) => `<a href="${escapeHtml(link(key, section))}"${key === role ? ' aria-current="page"' : ''}>${label}<span>${mail.filter(message => belongsTo(message, key)).length}</span></a>`).join('');
  const sectionLinks = [['all', 'All messages'], ['approvals', 'Approval OTPs'], ['other', 'Login & other messages']].map(([key, label]) =>
    `<a href="${escapeHtml(link(role, key))}"${key === section ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`).join('');
  const renderMessage = message => {
    const sentAt = Number.isFinite(message.sentAt) ? message.sentAt : Date.parse(message.received);
    const expired = message.code && Date.now() - sentAt >= 5 * 60 * 1000;
    const time = new Date(sentAt).toLocaleString('en-GB', { timeZone: 'Asia/Colombo', dateStyle: 'medium', timeStyle: 'medium' });
    return `<article><div class="message-top"><span class="badge">${message.approval ? 'Approval OTP' : message.code ? 'Verification OTP' : 'Email'}</span>${message.code ? `<span class="${expired ? 'expired' : 'recent'}">${expired ? '5-minute window ended' : 'Within 5-minute window'}</span>` : ''}</div>
      <h3>${escapeHtml(message.subject)}</h3><p class="recipient">To: ${escapeHtml(message.recipients.join(', '))}</p>
      ${message.code ? `<div class="code${expired ? ' old' : ''}" aria-label="OTP code">${message.code}</div>` : ''}
      <p class="time">Sent ${escapeHtml(time)} (Sri Lanka time)</p><details><summary>View email</summary><pre>${escapeHtml(message.body)}</pre></details></article>`;
  };
  const renderSection = (approval, title, description, empty) => {
    const entries = visible.filter(message => message.approval === approval);
    return `<section aria-label="${escapeHtml(title)}"><div class="section-heading"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p></div><span class="total">${entries.length}</span></div><div class="messages">${entries.map(renderMessage).join('') || `<p class="empty">${escapeHtml(empty)}</p>`}</div></section>`;
  };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>MIMS local inbox</title><style>
    *{box-sizing:border-box}body{font-family:system-ui,sans-serif;margin:0;background:#f3f6fa;color:#172c46}main{max-width:1120px;margin:0 auto;padding:32px 24px 64px}h1{font-size:30px;margin:6px 0 12px}h2{font-size:21px;margin:0}h3{font-size:16px;margin:18px 0 8px;overflow-wrap:anywhere}p{line-height:1.6}header{display:flex;justify-content:space-between;align-items:center;gap:24px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:2px;color:#52708e}header p,.section-heading p{color:#5b6f86;margin:8px 0}button{background:#133f69;color:white;border:0;border-radius:9px;padding:12px 18px;font:inherit;cursor:pointer;white-space:nowrap}a{color:inherit;text-decoration:none}nav{display:flex;flex-wrap:wrap;gap:8px;margin:24px 0}nav a{display:flex;align-items:center;gap:12px;border:1px solid #d8e1eb;border-radius:9px;padding:12px 16px;background:white}nav a[aria-current]{background:#133f69;border-color:#133f69;color:white}nav a span{font-size:12px;background:#e8eff7;color:#214765;border-radius:20px;padding:2px 8px}.sections{margin-top:12px}.sections a{padding:9px 14px;font-size:14px}section{margin-top:32px}.section-heading{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:16px}.section-heading p{font-size:14px}.total{border-radius:24px;background:#e1eaf4;padding:6px 14px}.messages{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}article{background:white;border:1px solid #d8e1eb;border-radius:14px;padding:22px}.message-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px}.badge{background:#edf2fa;color:#234b77;border-radius:6px;padding:5px 9px;font-weight:600}.recent{color:#1c7252}.expired{color:#8d5b32}.recipient,.time{font-size:13px;color:#5b6f86;overflow-wrap:anywhere}.code{font-family:ui-monospace,monospace;font-size:36px;font-weight:700;letter-spacing:8px;margin:18px 0;color:#123f6c;user-select:all}.code.old{color:#7b8794}.time{margin-bottom:16px}summary{font-size:13px;cursor:pointer;color:#234b77}pre{font-family:inherit;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6}.empty{grid-column:1/-1;border:1px dashed #c7d5e4;border-radius:12px;padding:28px;background:#fafcfe;color:#5b6f86}.notice{padding:12px 16px;border-radius:8px;background:#fff2dc;color:#81511d}.footnote{font-size:12px;color:#5b6f86;margin-top:32px}@media(max-width:680px){main{padding:24px 16px}header{align-items:flex-start;flex-direction:column}.messages{grid-template-columns:1fr}nav a{padding:10px 12px}h1{font-size:26px}}
    </style></head><body><main><header><div><span class="eyebrow">MIMS LOCAL EMAIL</span><h1>${escapeHtml(inboxRoles.find(([key]) => key === role)[1])} inbox</h1><p>OTP codes and invitations for fictional employees. No email leaves this computer.</p></div><form><input type="hidden" name="role" value="${role}"><input type="hidden" name="section" value="${section}"><button>Refresh inbox</button></form></header>
    ${directoryError ? '<p class="notice">Employee roles could not be loaded. Messages are available in All roles and Other recipients. Refresh to retry.</p>' : ''}
    <nav aria-label="Role inboxes">${roleLinks}</nav><nav class="sections" aria-label="Message sections">${sectionLinks}</nav>
    ${section !== 'other' ? renderSection(true, 'Approval OTPs', 'Employee creation, deactivation and approval request codes.', 'No approval emails in this inbox yet. Codes arrive when an approval is requested.') : ''}
    ${section !== 'approvals' ? renderSection(false, 'Login & other messages', 'Sign-in codes, password recovery and employee invitations.', 'No login or other emails in this inbox yet.') : ''}
    <p class="footnote">Codes expire 5 minutes after generation and may already have been used. Role inboxes organize this local demo mailbox; the assigned reviewer must sign in to approve a request. Messages stay in memory until the local stack stops.</p></main></body></html>`;
}

export async function createLocalMailbox({ inboxPort = 8025, getRecipients = async () => [] } = {}) {
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

  const inbox = createHttpServer(async (request, response) => {
    if (request.method !== 'GET') { response.writeHead(405).end(); return; }
    response.setHeader('Cache-Control', 'no-store');
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/messages') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(messages));
      return;
    }
    if (url.pathname !== '/') { response.writeHead(404).end('Not found'); return; }
    const requestedRole = url.searchParams.get('role');
    const role = inboxRoles.some(([key]) => key === requestedRole) ? requestedRole : 'all';
    const requestedSection = url.searchParams.get('section');
    const section = ['all', 'approvals', 'other'].includes(requestedSection) ? requestedSection : 'all';
    let directory = [], directoryError = false;
    try { directory = await getRecipients(); }
    catch { directoryError = true; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
    response.end(mailboxPage(messages, directory, role, section, directoryError));
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
