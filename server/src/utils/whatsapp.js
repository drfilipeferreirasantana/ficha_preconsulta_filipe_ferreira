/**
 * Gera links "clique para enviar" do WhatsApp (wa.me / api.whatsapp.com).
 *
 * Não há integração com a API oficial do WhatsApp Business configurada neste
 * sistema (isso exigiria conta Meta Business, número verificado e custos por
 * mensagem). Por isso o envio funciona como na ficha de pré-consulta: o
 * sistema monta a mensagem pronta e abre o WhatsApp Web/App para o usuário
 * apenas conferir e clicar em enviar - não é 100% automático, mas não
 * depende de nenhuma credencial paga.
 */

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

function buildWhatsappLink(phone, message) {
  let digits = onlyDigits(phone);
  if (!digits) return null;
  // Assume Brasil (55) se o numero nao vier com codigo do pais
  if (digits.length <= 11) digits = '55' + digits;
  return `https://api.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(message)}`;
}

function money(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function processRegisteredMessage({ clientName, processNumber, court, caseValue, feeType, feePercentage }) {
  const lines = [
    `Olá, ${clientName}!`,
    ``,
    `Seu processo${processNumber ? ` nº ${processNumber}` : ''}${court ? ` (${court})` : ''} foi cadastrado em nosso sistema de acompanhamento.`
  ];
  if (caseValue) lines.push(`Valor da causa: ${money(caseValue)}`);
  if (feeType === 'percentual' && feePercentage) lines.push(`Honorários: ${feePercentage}% sobre o valor da causa/êxito.`);
  lines.push(
    `A partir de agora você será informado sempre que houver uma nova movimentação processual.`,
    ``,
    `Att.,`,
    `Filipe Ferreira Advogados · OAB/ES 37.159`
  );
  return lines.join('\n');
}

function processUpdateMessage({ clientName, processNumber, description }) {
  return [
    `Olá, ${clientName}!`,
    ``,
    `Houve uma nova movimentação no seu processo${processNumber ? ` nº ${processNumber}` : ''}:`,
    ``,
    description,
    ``,
    `Qualquer dúvida, estou à disposição.`,
    `Filipe Ferreira Advogados · OAB/ES 37.159`
  ].join('\n');
}

function receiptReadyMessage({ clientName, amount }) {
  const money = (Number(amount) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return [
    `Olá, ${clientName}!`,
    ``,
    `Segue em anexo o recibo referente ao valor de entrada de ${money}.`,
    ``,
    `Att.,`,
    `Filipe Ferreira Advogados · OAB/ES 37.159`
  ].join('\n');
}

module.exports = { buildWhatsappLink, processRegisteredMessage, processUpdateMessage, receiptReadyMessage };
