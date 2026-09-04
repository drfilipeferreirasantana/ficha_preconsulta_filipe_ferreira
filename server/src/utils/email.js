/**
 * Envio de e-mail transacional via Resend (https://resend.com).
 *
 * Por que Resend: tem plano gratuito (100 e-mails/dia, 3.000/mês), API
 * simples via HTTP, e permite testar sem verificar domínio próprio (usando
 * o remetente onboarding@resend.dev - nesse caso só é possível enviar para
 * o e-mail cadastrado na sua conta Resend, até você verificar um domínio).
 *
 * Pre-requisito (feito por voce, uma vez):
 *   1. Criar conta em https://resend.com
 *   2. Gerar uma API Key em Dashboard > API Keys.
 *   3. (Opcional, para enviar a qualquer destinatário) Verificar um domínio
 *      seu em Dashboard > Domains - ex: usando um subdomínio como
 *      mail.filipeferreiraadv.com, adicionando os registros DNS que a
 *      Resend pedir (parecido com o que fizemos para o Google/Render).
 *   4. Definir no .env: RESEND_API_KEY e EMAIL_FROM
 *      (ex: "Filipe Ferreira Advogados <contato@mail.filipeferreiraadv.com>"
 *      ou, para testes, "Filipe Ferreira Advogados <onboarding@resend.dev>")
 */

const API_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.EMAIL_FROM || 'Filipe Ferreira Advogados <onboarding@resend.dev>';

function isConfigured() {
  return Boolean(API_KEY);
}

async function sendEmail({ to, subject, html }) {
  if (!isConfigured() || !to) return { sent: false };
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], subject, html })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('[email] falha ao enviar:', resp.status, text.slice(0, 300));
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] falha ao enviar:', err.message);
    return { sent: false };
  }
}

function wrapHtml(bodyLines) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.7;max-width:560px">
    ${bodyLines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join('')}
    <hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px">
    <p style="font-size:11px;color:#888">Filipe Ferreira Advogados · OAB/ES 37.159</p>
  </div>`;
}

function processRegisteredEmail({ clientName, processNumber, court, caseValue }) {
  const lines = [
    `Olá, ${clientName}!`,
    `Seu processo${processNumber ? ` nº ${processNumber}` : ''}${court ? ` (${court})` : ''} foi cadastrado em nosso sistema de acompanhamento.`
  ];
  if (caseValue) lines.push(`Valor da causa: ${(Number(caseValue)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  lines.push('A partir de agora você será informado sempre que houver uma nova movimentação processual.');
  return wrapHtml(lines);
}

function processUpdateEmail({ clientName, processNumber, description }) {
  return wrapHtml([
    `Olá, ${clientName}!`,
    `Houve uma nova movimentação no seu processo${processNumber ? ` nº ${processNumber}` : ''}:`,
    description
  ]);
}

module.exports = { isConfigured, sendEmail, processRegisteredEmail, processUpdateEmail };
