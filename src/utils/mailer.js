const nodemailer = require('nodemailer');

/// Envio de e-mails. Dois jeitos, configurados no .env:
///
/// 1) Brevo (API HTTPS) — usado quando BREVO_API_KEY existe. Necessário em
///    hospedagens que bloqueiam SMTP (ex: plano gratuito do Render).
///      BREVO_API_KEY, MAIL_FROM_EMAIL (remetente verificado no Brevo),
///      MAIL_FROM_NAME (opcional, padrão "PontoClick")
///
/// 2) SMTP — SMTP_HOST, SMTP_PORT (587 = STARTTLS, 465 = SSL), SMTP_USER, SMTP_PASS
///    e SMTP_FROM (opcional; padrão "PontoClick <SMTP_USER>").
///    Gmail: smtp.gmail.com, porta 587, com "senha de app" (não a senha da conta).

let transporter = null;

function useBrevo() {
  return Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM_EMAIL);
}

function isMailConfigured() {
  return useBrevo() || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/// Envia pela API do Brevo (https://developers.brevo.com/reference/sendtransacemail).
async function sendWithBrevo({ to, subject, text, html, replyTo }) {
  const body = {
    sender: { email: process.env.MAIL_FROM_EMAIL, name: process.env.MAIL_FROM_NAME || 'PontoClick' },
    to: [{ email: to }],
    subject,
    textContent: text,
    htmlContent: html,
  };
  if (replyTo) body.replyTo = replyTo;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo respondeu ${response.status}: ${detail.slice(0, 300)}`);
  }
  return response.json().catch(() => ({}));
}

function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      // Senhas de app do Google são mostradas com espaços ("abcd efgh ..."): remove para aceitar colada assim.
      auth: { user: process.env.SMTP_USER, pass: String(process.env.SMTP_PASS).replace(/\s/g, '') },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return transporter;
}

/// Envia um e-mail. Lança erro se o serviço recusar ou não responder.
/// replyTo: { email, name } — para onde vai o "Responder".
async function sendMail({ to, subject, text, html, replyTo }) {
  if (useBrevo()) return sendWithBrevo({ to, subject, text, html, replyTo });
  const from = process.env.SMTP_FROM || `"PontoClick" <${process.env.SMTP_USER}>`;
  return getTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html,
    replyTo: replyTo ? { address: replyTo.email, name: replyTo.name } : undefined,
  });
}

/// E-mail com o código de recuperação de senha.
async function sendPasswordResetCode({ to, name, code, validityMinutes }) {
  const firstName = String(name || '').trim().split(/\s+/)[0] || 'olá';
  const spacedCode = code.split('').join(' ');

  const text = [
    `Olá, ${firstName}!`,
    '',
    `Seu código para redefinir a senha do PontoClick é: ${code}`,
    '',
    `Ele vale por ${validityMinutes} minutos e só pode ser usado uma vez.`,
    'Se você não pediu a troca de senha, ignore este e-mail: sua senha continua a mesma.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f2f1ee;font-family:Arial,Helvetica,sans-serif;color:#101010">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px">
        <tr><td>
          <p style="margin:0 0 4px;font-size:22px;font-weight:bold">Ponto<span style="color:#a8613b">Click</span></p>
          <p style="margin:0 0 24px;font-size:13px;color:#66666f">Redefinição de senha</p>
          <p style="margin:0 0 16px;font-size:15px">Olá, ${escapeHtml(firstName)}!</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.5">Use o código abaixo no app para criar uma nova senha:</p>
          <p style="margin:0 0 16px;padding:16px;background:#eeeeff;border-radius:12px;text-align:center;font-size:30px;font-weight:bold;letter-spacing:6px;color:#4341d9">${spacedCode}</p>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#4b4b46">Ele vale por ${validityMinutes} minutos e só pode ser usado uma vez.</p>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#4b4b46">Se você não pediu a troca de senha, ignore este e-mail: sua senha continua a mesma.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return sendMail({ to, subject: `${code} é seu código do PontoClick`, text, html });
}

/// E-mail para o suporte com a mensagem enviada pelo app. "Responder" vai direto para o usuário.
async function sendSupportMessage({ to, user, message, appVersion, platform, messageId }) {
  const sentAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const details = [
    `Usuário: ${user.name} <${user.email}> (id ${user.id})`,
    `Aparelho: ${platform || 'não informado'} · versão do app: ${appVersion || 'não informada'}`,
    `Enviada em: ${sentAt} (horário de Brasília) · mensagem nº ${messageId}`,
  ];
  const text = [...details, '', message].join('\n');
  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:24px;background:#f2f1ee;font-family:Arial,Helvetica,sans-serif;color:#101010">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:28px">
      <tr><td>
        <p style="margin:0 0 4px;font-size:20px;font-weight:bold">Ponto<span style="color:#a8613b">Click</span> · Suporte</p>
        <p style="margin:0 0 20px;font-size:13px;color:#66666f;line-height:1.6">${details.map(escapeHtml).join('<br>')}</p>
        <p style="margin:0;padding:16px;background:#f2f1ee;border-radius:12px;font-size:15px;line-height:1.55;white-space:pre-wrap">${escapeHtml(message)}</p>
        <p style="margin:16px 0 0;font-size:12px;color:#66666f">Responda este e-mail para falar direto com o usuário.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>`;

  const preview = message.replace(/\s+/g, ' ').slice(0, 60);
  return sendMail({
    to,
    replyTo: { email: user.email, name: user.name },
    subject: `[Suporte PontoClick] ${user.name}: ${preview}${message.length > 60 ? '…' : ''}`,
    text,
    html,
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

module.exports = { isMailConfigured, sendMail, sendPasswordResetCode, sendSupportMessage };
