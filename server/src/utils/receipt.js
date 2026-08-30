/** Geração de recibo simples em HTML, pronto para impressão/"salvar como PDF" pelo navegador. */

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function tresDigitos(n) {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (c) parts.push(CENTENAS[c]);
  if (rest) {
    if (rest < 10) parts.push(UNIDADES[rest]);
    else if (rest < 20) parts.push(DEZ_A_DEZENOVE[rest - 10]);
    else {
      const d = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return parts.join(' e ');
}

function porExtenso(n) {
  n = Math.floor(n);
  if (n === 0) return 'zero';
  const milhoes = Math.floor(n / 1000000);
  const milhares = Math.floor((n % 1000000) / 1000);
  const centenas = n % 1000;
  const partes = [];
  if (milhoes) partes.push(`${tresDigitos(milhoes)} ${milhoes === 1 ? 'milhão' : 'milhões'}`);
  if (milhares) partes.push(`${milhares === 1 ? 'mil' : tresDigitos(milhares) + ' mil'}`);
  if (centenas) partes.push(tresDigitos(centenas));
  return partes.join(' e ');
}

function valorPorExtenso(valor) {
  const reais = Math.floor(valor);
  const centavos = Math.round((valor - reais) * 100);
  let texto = `${porExtenso(reais)} ${reais === 1 ? 'real' : 'reais'}`;
  if (centavos > 0) {
    texto += ` e ${porExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`;
  }
  return texto;
}

function money(v) {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateBR(d) {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function renderReceiptHtml({ clientName, clientDocument, amount, description, processNumber, receiptNumber, date }) {
  const motivo = description || 'Entrada dos Honorários Pró-labore Advocatícios';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Recibo #${receiptNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600;700&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body{font-family:'Montserrat',Georgia,serif;background:#f2f2f2;margin:0;padding:2rem}
  .sheet{max-width:720px;margin:0 auto;background:#fff;border:1px solid #ddd;overflow:hidden}
  .sheet-body{padding:3rem 3rem 2rem}
  .head{text-align:center;margin-bottom:2rem;border-bottom:2px solid #39414a;padding-bottom:1.25rem}
  .head h1{font-size:19px;letter-spacing:.1em;color:#39414a;margin:0;font-weight:600}
  .head p{font-size:11px;color:#666;margin-top:4px;letter-spacing:.05em}
  .title{text-align:center;font-size:15px;letter-spacing:.2em;margin:2rem 0 1.5rem;color:#39414a;font-weight:600}
  .amount{text-align:center;font-size:30px;font-weight:700;margin:0 0 1.5rem;color:#39414a;font-family:Georgia,serif}
  p.body-text{font-size:14px;line-height:1.9;color:#222;text-align:justify;font-family:Georgia,serif}
  .meta{margin-top:2rem;font-size:12px;color:#555}
  .sign{margin-top:3.5rem;text-align:center}
  .sign .signature{font-family:'Dancing Script',cursive;font-size:38px;color:#1a1a2a;margin-bottom:-4px}
  .sign .line{width:280px;border-top:1px solid #333;margin:6px auto 6px}
  .sign p{font-size:12px;margin:2px 0;color:#333}
  .footer-bar img{width:100%;display:block}
  @media print{body{background:#fff;padding:0}.sheet{border:none}}
</style>
</head>
<body>
  <div class="sheet">
    <div class="sheet-body">
      <div class="head">
        <h1>FILIPE FERREIRA ADVOGADO &amp; ASSOCIADOS</h1>
        <p>OAB/ES 37.159</p>
      </div>
      <div class="title">RECIBO Nº ${receiptNumber}</div>
      <div class="amount">${money(amount)}</div>
      <p class="body-text">
        Recebemos de <strong>${clientName}</strong>${clientDocument ? `, portador(a) do documento nº ${clientDocument},` : ''}
        a quantia de <strong>${money(amount)}</strong> (${valorPorExtenso(amount)}), referente a ${motivo}.
      </p>
      <p class="body-text">Para clareza, firmamos o presente recibo.</p>
      ${processNumber ? `<div class="meta">Processo relacionado: nº ${processNumber}</div>` : ''}
      <div class="meta">Vitória/ES, ${dateBR(date)}.</div>
      <div class="sign">
        <div class="signature">Filipe Ferreira</div>
        <div class="line"></div>
        <p>Filipe Ferreira</p>
        <p>OAB/ES 37.159</p>
      </div>
    </div>
    <div class="footer-bar"><img src="/assets/rodape-contato.png" alt=""></div>
  </div>
</body>
</html>`;
}

module.exports = { renderReceiptHtml, valorPorExtenso, money };
