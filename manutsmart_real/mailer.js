const nodemailer = require('nodemailer');

function smtpIsConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function makeTransporter() {
  if (!smtpIsConfigured()) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendVerificationEmail({ to, name, code }) {
  const appName = process.env.APP_NAME || 'ManutSmart';
  const transporter = makeTransporter();

  const subject = `Código de verificação - ${appName}`;
  const text = `Olá, ${name}.\n\nSeu código de verificação do ${appName} é: ${code}\n\nEle expira em 15 minutos.\n\nSe você não tentou criar uma conta, ignore este email.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2>${appName}</h2>
      <p>Olá, <strong>${name}</strong>.</p>
      <p>Seu código de verificação é:</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;background:#f3f4f6;padding:12px 16px;border-radius:10px;display:inline-block">${code}</p>
      <p>Ele expira em 15 minutos.</p>
      <p style="color:#6b7280">Se você não tentou criar uma conta, ignore este email.</p>
    </div>
  `;

  if (!transporter) {
    console.log('\n==================================================');
    console.log('SMTP não configurado. Código de verificação em modo desenvolvimento:');
    console.log(`Email: ${to}`);
    console.log(`Código: ${code}`);
    console.log('Configure SMTP no .env para envio real.');
    console.log('==================================================\n');
    return { mode: 'development_log' };
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `${appName} <no-reply@localhost>`,
    to,
    subject,
    text,
    html
  });

  return { mode: 'smtp' };
}

module.exports = {
  sendVerificationEmail,
  smtpIsConfigured
};
