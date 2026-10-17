/**
 * Calculo de prazos processuais a partir de uma intimacao publicada no DJEN.
 *
 * Regra da publicacao eletronica (Lei 11.419/2006, art. 4o, §§ 3o e 4o):
 *  - considera-se publicada no primeiro dia util seguinte a disponibilizacao;
 *  - o prazo comeca a correr no primeiro dia util seguinte a publicacao.
 * Contagem em dias uteis (CPC art. 219), com o recesso de 20/12 a 20/01
 * suspendendo os prazos (CPC art. 220). Se o ultimo dia cair em dia sem
 * expediente, prorroga para o proximo dia util (CPC art. 224, § 1o).
 *
 * So conhece feriados NACIONAIS (fixos e moveis). Feriados estaduais e
 * municipais e suspensoes decretadas pelo tribunal nao entram - por isso a
 * data calculada e sempre uma sugestao que o advogado confere e pode editar.
 *
 * Datas trafegam como texto "AAAA-MM-DD" e sao manipuladas em UTC, para
 * nao sofrer com fuso horario/horario de verao.
 */

const FIXED_HOLIDAYS = {
  '01-01': 'Confraternização Universal',
  '04-21': 'Tiradentes',
  '05-01': 'Dia do Trabalho',
  '09-07': 'Independência',
  '10-12': 'Nossa Senhora Aparecida',
  '11-02': 'Finados',
  '11-15': 'Proclamação da República',
  '11-20': 'Consciência Negra',
  '12-25': 'Natal'
};

function parse(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function fmt(date) {
  return date.toISOString().slice(0, 10);
}
function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

// Domingo de Pascoa (algoritmo de Meeus/Jones/Butcher, calendario gregoriano).
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const movableCache = new Map();
function movableHolidays(year) {
  if (!movableCache.has(year)) {
    const e = easter(year);
    movableCache.set(year, {
      [fmt(addDays(e, -48))]: 'Carnaval',
      [fmt(addDays(e, -47))]: 'Carnaval',
      [fmt(addDays(e, -2))]: 'Sexta-feira Santa',
      [fmt(addDays(e, 60))]: 'Corpus Christi'
    });
  }
  return movableCache.get(year);
}

/** Nome do feriado nacional na data, ou null. */
function holidayName(date) {
  const iso = fmt(date);
  return FIXED_HOLIDAYS[iso.slice(5)] || movableHolidays(date.getUTCFullYear())[iso] || null;
}

/** Recesso forense: 20/12 a 20/01, inclusive (CPC art. 220). */
function isRecess(date) {
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return (m === 12 && d >= 20) || (m === 1 && d <= 20);
}

function isWeekend(date) {
  const wd = date.getUTCDay();
  return wd === 0 || wd === 6;
}

/** Dia sem expediente forense: fim de semana ou feriado nacional. */
function isNonWorkingDay(date) {
  return isWeekend(date) || Boolean(holidayName(date));
}

/** Dia util para contagem de prazo: com expediente e fora do recesso. */
function isCountingDay(date) {
  return !isNonWorkingDay(date) && !isRecess(date);
}

function nextCountingDay(date) {
  let d = addDays(date, 1);
  while (!isCountingDay(d)) d = addDays(d, 1);
  return d;
}

function nextWorkingDay(date) {
  let d = addDays(date, 1);
  while (isNonWorkingDay(d)) d = addDays(d, 1);
  return d;
}

/**
 * Calcula o prazo de uma intimacao.
 * @param {object} p
 * @param {string} p.disponibilizacao data "AAAA-MM-DD" em que saiu no DJEN
 * @param {number} p.dias quantidade de dias do prazo
 * @param {boolean} [p.corridos] true = dias corridos (ex: penal); padrao uteis
 * @param {boolean} [p.dobro] prazo em dobro (Fazenda Publica, Defensoria)
 * @param {number} [p.lembreteDias] dias uteis de antecedencia do lembrete interno
 */
function calcularPrazo({ disponibilizacao, dias, corridos = false, dobro = false, lembreteDias = 2 }) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(disponibilizacao || ''))) {
    throw new Error('Data de disponibilização inválida (use AAAA-MM-DD).');
  }
  const base = Math.floor(Number(dias));
  if (!Number.isFinite(base) || base < 1 || base > 365) {
    throw new Error('Informe um prazo entre 1 e 365 dias.');
  }
  const total = dobro ? base * 2 : base;
  const disp = parse(disponibilizacao);
  // Em dias corridos (ex: penal) o recesso do CPC art. 220 nao suspende o
  // prazo; so fins de semana e feriados deslocam publicacao e inicio.
  const proximo = corridos ? nextWorkingDay : nextCountingDay;
  const publicacao = proximo(disp);
  const inicio = proximo(publicacao);

  const pulados = [];
  let final;
  if (corridos) {
    final = addDays(inicio, total - 1);
    if (isNonWorkingDay(final)) {
      const original = final;
      final = nextWorkingDay(final);
      pulados.push(`${fmtBR(original)} sem expediente, prorrogado`);
    }
  } else {
    let d = inicio;
    let contados = 1;
    while (contados < total) {
      d = addDays(d, 1);
      if (isCountingDay(d)) {
        contados += 1;
      } else if (!isWeekend(d)) {
        const nome = holidayName(d) || 'recesso forense';
        pulados.push(`${fmtBR(d)} (${nome})`);
      }
    }
    final = d;
  }

  // Lembrete interno: N dias uteis antes do final, nunca antes do inicio.
  let lembrete = null;
  if (lembreteDias > 0) {
    let d = final;
    let voltou = 0;
    while (voltou < lembreteDias) {
      d = addDays(d, -1);
      if (isCountingDay(d)) voltou += 1;
    }
    if (d >= inicio) lembrete = fmt(d);
  }

  const partes = [
    `Disponibilizada em ${fmtBR(disp)}`,
    `publicada em ${fmtBR(publicacao)}`,
    `início em ${fmtBR(inicio)}`,
    `${total} ${total === 1 ? (corridos ? 'dia corrido' : 'dia útil') : (corridos ? 'dias corridos' : 'dias úteis')}${dobro ? ` (${base} em dobro)` : ''}`
  ];
  let explicacao = partes.join(' · ') + '.';
  if (pulados.length) explicacao += ` Não contados: ${pulados.slice(0, 6).join(', ')}${pulados.length > 6 ? '…' : ''}.`;

  return {
    publicacao: fmt(publicacao),
    inicio: fmt(inicio),
    final: fmt(final),
    lembrete,
    total,
    explicacao
  };
}

function fmtBR(date) {
  const iso = fmt(date);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** Data N dias uteis antes de "iso" (para lembretes), em "AAAA-MM-DD". */
function diasUteisAntes(iso, n) {
  let d = parse(iso);
  let voltou = 0;
  while (voltou < n) {
    d = addDays(d, -1);
    if (isCountingDay(d)) voltou += 1;
  }
  return fmt(d);
}

module.exports = { calcularPrazo, diasUteisAntes, holidayName, isRecess, easter };
