/**
 * Integracao com o DJEN - Diario de Justica Eletronico Nacional
 * (Comunica API do PJe/CNJ - Resolucao CNJ 455/2022).
 *
 * https://comunicaapi.pje.jus.br/swagger/index.html
 *
 * Schema de resposta CONFIRMADO em teste real (não é mais especulação):
 * GET /api/v1/comunicacao?numeroOab=37159&ufOab=ES&itensPorPagina=25&pagina=1
 * devolve { status, message, count, items: [{ id, data_disponibilizacao,
 * siglaTribunal, tipoComunicacao, nomeOrgao, texto, numero_processo,
 * numeroprocessocommascara, nomeClasse, hash, link, destinatarios,
 * destinatarioadvogados, ... }] }. Não exige autenticação.
 *
 * ATENCAO - bloqueio de rede a partir do servidor:
 * Essa API tem restrição/instabilidade para chamadas vindas de fora do
 * Brasil. Se o servidor (Render) não estiver com saída num IP brasileiro,
 * a sincronização automática abaixo pode falhar com 403/timeout - use
 * GET /api/integrations/djen/test para diagnosticar isso rapidamente.
 * Nesse caso, a alternativa que funciona de verdade é a Opção B: o
 * navegador do usuário (que está no Brasil) busca direto na API e manda
 * os itens brutos para POST /api/integrations/djen/ingest, que roda a
 * mesma lógica de deduplicação/gravação. A tela de Notificações oferece
 * as duas opções.
 *
 * Etiqueta de uso: nunca passar itensPorPagina acima de 50 (a API volta
 * vazio silenciosamente acima disso) e não fazer polling agressivo -
 * comunicações judiciais não mudam em tempo real.
 */

const db = require('../db');

const BASE_URL = process.env.DJEN_BASE_URL || 'https://comunicaapi.pje.jus.br/api/v1';
const OAB_NUMERO = process.env.ADVOGADO_OAB_NUMERO || '';
const OAB_UF = process.env.ADVOGADO_OAB_UF || '';
const MAX_ITENS_POR_PAGINA = 50;

function isConfigured() {
  return Boolean(OAB_NUMERO && OAB_UF);
}

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

function cleanHtml(str) {
  return (str || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function isSigiloso(item) {
  const dest = item.destinatarios || [];
  return dest.some((d) => /segredo de justi/i.test(d.nome || '') || /segredo de justi/i.test(d.polo || ''));
}

/** Busca comunicacoes (intimacoes/publicacoes) no DJEN para a OAB configurada. */
async function fetchComunicacoes({ dataInicio, dataFim, pagina = 1, itensPorPagina = MAX_ITENS_POR_PAGINA } = {}) {
  if (!isConfigured()) {
    const err = new Error('Integracao DJEN nao configurada. Defina ADVOGADO_OAB_NUMERO e ADVOGADO_OAB_UF no .env.');
    err.code = 'DJEN_NOT_CONFIGURED';
    throw err;
  }

  const params = new URLSearchParams({
    numeroOab: OAB_NUMERO,
    ufOab: OAB_UF,
    pagina: String(pagina),
    itensPorPagina: String(Math.min(itensPorPagina, MAX_ITENS_POR_PAGINA))
  });
  if (dataInicio) params.set('dataDisponibilizacaoInicio', dataInicio);
  if (dataFim) params.set('dataDisponibilizacaoFim', dataFim);

  const url = `${BASE_URL}/comunicacao?${params.toString()}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Falha ao consultar DJEN (HTTP ${resp.status}): ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  const items = Array.isArray(data) ? data : (data.items || data.data || []);
  return { items, raw: data };
}

/** Testa a conectividade do servidor com a API do DJEN, sem tocar no banco. */
async function testConnection() {
  if (!isConfigured()) return { ok: false, reason: 'not_configured' };
  try {
    const resp = await fetch(`${BASE_URL}/comunicacao?numeroOab=${OAB_NUMERO}&ufOab=${OAB_UF}&itensPorPagina=1&pagina=1`, {
      headers: { Accept: 'application/json' }
    });
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, bodyPreview: text.slice(0, 200) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Normaliza um item de comunicacao (schema confirmado da Comunica API). */
function normalizeItem(item) {
  return {
    externalId: String(item.id ?? item.hash ?? item.numeroComunicacao ?? `${item.numero_processo}-${item.data_disponibilizacao}`),
    processNumber: item.numeroprocessocommascara || item.numero_processo || null,
    court: item.siglaTribunal || null,
    type: item.tipoComunicacao || item.tipoDocumento || 'Comunicação',
    orgName: item.nomeOrgao || null,
    className: item.nomeClasse || null,
    content: cleanHtml(item.texto),
    link: item.link || null,
    date: item.data_disponibilizacao || null,
    sigiloso: isSigiloso(item)
  };
}

/**
 * Processa uma lista de itens brutos da Comunica API (vindos de fetch no
 * servidor OU enviados pelo navegador do usuario) - grava os novos,
 * ignora duplicados por external_id (dedupe), tenta vincular a um processo
 * cadastrado pelo numero, e gera notificacao. Nunca sobrescreve is_read de
 * itens ja existentes.
 */
function processItems(items) {
  const insertComm = db.prepare(`
    INSERT OR IGNORE INTO djen_communications
      (external_id, process_id, process_number, court, communication_type, org_name, class_name, content, link, sigiloso, disponibilizacao_date, matched, raw_json)
    VALUES (@external_id, @process_id, @process_number, @court, @communication_type, @org_name, @class_name, @content, @link, @sigiloso, @disponibilizacao_date, @matched, @raw_json)
  `);
  const insertUpdate = db.prepare(`
    INSERT INTO process_updates (process_id, description, date, source) VALUES (?, ?, ?, 'djen')
  `);
  const insertNotification = db.prepare(`
    INSERT INTO notifications (process_id, title, message, source) VALUES (?, ?, ?, 'djen')
  `);
  const findProcess = db.prepare(`
    SELECT id, client_id FROM processes WHERE REPLACE(REPLACE(REPLACE(number,'-',''),'.',''),' ','') = ?
  `);

  let created = 0;
  let matched = 0;

  const tx = db.transaction((rawItems) => {
    for (const raw of rawItems) {
      const n = normalizeItem(raw);
      const processNumberKey = n.processNumber ? onlyDigits(n.processNumber) : null;
      const process = processNumberKey ? findProcess.get(processNumberKey) : null;

      const info = insertComm.run({
        external_id: n.externalId,
        process_id: process ? process.id : null,
        process_number: n.processNumber,
        court: n.court,
        communication_type: n.type,
        org_name: n.orgName,
        class_name: n.className,
        content: n.content,
        link: n.link,
        sigiloso: n.sigiloso ? 1 : 0,
        disponibilizacao_date: n.date,
        matched: process ? 1 : 0,
        raw_json: JSON.stringify(raw)
      });

      if (info.changes === 0) continue; // ja existia (duplicado pelo external_id)
      created += 1;

      const resumo = n.content ? n.content.slice(0, 250) : null;
      const title = process
        ? `Nova movimentação: processo ${n.processNumber}`
        : `Nova intimação recebida (processo ${n.processNumber || 'não identificado'} não cadastrado)`;

      if (process) {
        matched += 1;
        insertUpdate.run(process.id, `[DJEN] ${n.type}: ${n.content}`.slice(0, 2000), n.date);
        insertNotification.run(process.id, title, resumo);
      } else {
        insertNotification.run(null, title, resumo);
      }
    }
  });

  tx(items);
  return { fetched: items.length, created, matched };
}

async function syncOfficeNotifications({ days = 7 } = {}) {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  const { items } = await fetchComunicacoes({ dataInicio: fmt(inicio), dataFim: fmt(fim) });
  return processItems(items);
}

module.exports = { fetchComunicacoes, syncOfficeNotifications, processItems, testConnection, isConfigured };
