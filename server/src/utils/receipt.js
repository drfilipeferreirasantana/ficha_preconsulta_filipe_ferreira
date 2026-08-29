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
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Recibo #${receiptNumber}</title>
<style>
  body{font-family:Georgia,'Times New Roman',serif;background:#f2f2f2;margin:0;padding:2rem}
  .sheet{max-width:720px;margin:0 auto;background:#fff;padding:3rem;border:1px solid #ccc}
  .head{text-align:center;margin-bottom:2rem;border-bottom:2px solid #39414a;padding-bottom:1rem}
  .head h1{font-size:20px;letter-spacing:.1em;color:#39414a;margin:0}
  .head p{font-size:11px;color:#666;margin-top:4px}
  .title{text-align:center;font-size:16px;letter-spacing:.2em;margin:2rem 0;color:#39414a}
  .amount{text-align:center;font-size:28px;font-weight:bold;margin:1rem 0;color:#39414a}
  p.body-text{font-size:14px;line-height:1.9;color:#222;text-align:justify}
  .meta{margin-top:2.5rem;font-size:12px;color:#555}
  .sign{margin-top:4rem;text-align:center}
  .sign .line{width:280px;border-top:1px solid #333;margin:0 auto 6px}
  .sign p{font-size:12px;margin:2px 0}
  @media print{body{background:#fff;padding:0}.sheet{border:none}}
</style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <h1>FILIPE FERREIRA ADVOGADO &amp; ASSOCIADOS</h1>
      <p>OAB/ES 37.159</p>
    </div>
    <div class="title">RECIBO Nº ${receiptNumber}</div>
    <div class="amount">${money(amount)}</div>
    <p class="body-text">
      Recebemos de <strong>${clientName}</strong>${clientDocument ? `, portador(a) do documento nº ${clientDocument},` : ''}
      a quantia de <strong>${money(amount)}</strong> (${valorPorExtenso(amount)}), referente a
      ${description || 'honorários advocatícios'}${processNumber ? `, relativo ao processo nº ${processNumber}` : ''}.
    </p>
    <p class="body-text">Para clareza, firmamos o presente recibo.</p>
    <div class="meta">Vitória/ES, ${dateBR(date)}.</div>
    <div class="sign">
      <div class="line"></div>
      <p>Filipe Ferreira</p>
      <p>OAB/ES 37.159</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { renderReceiptHtml, valorPorExtenso, money };
