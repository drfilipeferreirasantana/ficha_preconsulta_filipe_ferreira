/**
 * Integracao com o DJEN - Diario de Justica Eletronico Nacional
 * (Comunica API do PJe/CNJ - Resolucao CNJ 455/2022).
 *
 * https://comunicaapi.pje.jus.br
 *
 * Diferente do webservice MNI do PJe (integrations/pje.js), a Comunica API do
 * DJEN e PUBLICA para consulta (GET /api/v1/comunicacao nao exige certificado
 * digital nem login - apenas os endpoints de escrita, de uso exclusivo dos
 * tribunais, sao autenticados). Isso permite buscar automaticamente TODAS as
 * intimacoes/publicacoes de qualquer tribunal do pais destinadas a um advogado,
 * bastando o numero da OAB - sem certificado A1 ou A3.
 *
 * IMPORTANTE - verificar na primeira execucao real:
 * A API nao pode ser acessada a partir deste ambiente de desenvolvimento para
 * confirmar o schema exato (bloqueio de rede do sandbox). Os nomes de
 * parametros e campos abaixo seguem a documentacao publica conhecida da
 * Comunica API, mas devem ser confirmados fazendo uma chamada real e
 * comparando com response.raw salvo em djen_communications.raw_json. Se algum
 * campo vier com nome diferente, ajuste apenas as constantes/mapeamentos
 * deste arquivo - o resto do sistema nao precisa mudar.
 */

const db = require('../db');

const BASE_URL = process.env.DJEN_BASE_URL || 'https://comunicaapi.pje.jus.br/api/v1';

const OAB_NUMERO = process.env.ADVOGADO_OAB_NUMERO || '';
const OAB_UF = process.env.ADVOGADO_OAB_UF || '';

function isConfigured() {
  return Boolean(OAB_NUMERO && OAB_UF);
}

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

/**
 * Busca comunicacoes (intimacoes/publicacoes) no DJEN para a OAB configurada,
 * dentro de um intervalo de datas.
 */
async function fetchComunicacoes({ dataInicio, dataFim, pagina = 1, itensPorPagina = 100 } = {}) {
  if (!isConfigured()) {
    const err = new Error(
      'Integracao DJEN nao configurada. Defina ADVOGADO_OAB_NUMERO e ADVOGADO_OAB_UF no .env.'
    );
    err.code = 'DJEN_NOT_CONFIGURED';
    throw err;
  }

  const params = new URLSearchParams({
    numeroOab: OAB_NUMERO,
    ufOab: OAB_UF,
    pagina: String(pagina),
    itensPorPagina: String(itensPorPagina)
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
  // A API documenta a lista de resultados em "items"; alguns ambientes/versoes
  // podem devolver em "data" ou diretamente como array - cobrimos os 3 casos.
  const items = Array.isArray(data) ? data : (data.items || data.data || []);
  return { items, raw: data };
}

/** Normaliza um item de comunicacao para o formato interno, tolerando variações de nome de campo. */
function normalizeItem(item) {
  return {
    externalId: String(item.hash || item.id || item.numeroComunicacao || `${item.numero_processo || item.numeroProcesso}-${item.data_disponibilizacao || item.dataDisponibilizacao}`),
    processNumber: item.numero_processo || item.numeroProcesso || item.numeroprocessocommascara || null,
    court: item.siglaTribunal || item.sigla_tribunal || item.tribunal || null,
    type: item.tipoComunicacao || item.tipo_comunicacao || item.tipoDocumento || 'Comunicacao',
    content: item.texto || item.conteudo || item.ementa || '',
    date: item.data_disponibilizacao || item.dataDisponibilizacao || null
  };
}

/**
 * Executa a sincronizacao: busca comunicacoes recentes, grava as novas em
 * djen_communications (evitando duplicidade por external_id), tenta vincular
 * a um processo cadastrado pelo numero, e gera notificacoes.
 */
async function syncOfficeNotifications({ days = 7 } = {}) {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const { items } = await fetchComunicacoes({ dataInicio: fmt(inicio), dataFim: fmt(fim) });

  const insertComm = db.prepare(`
    INSERT OR IGNORE INTO djen_communications
      (external_id, process_id, process_number, court, communication_type, content, disponibilizacao_date, matched, raw_json)
    VALUES (@external_id, @process_id, @process_number, @court, @communication_type, @content, @disponibilizacao_date, @matched, @raw_json)
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
      const processNumberKey = onlyDigits(n.processNumber);
      const process = processNumberKey ? findProcess.get(processNumberKey) : null;

      const info = insertComm.run({
        external_id: n.externalId,
        process_id: process ? process.id : null,
        process_number: n.processNumber,
        court: n.court,
        communication_type: n.type,
        content: n.content,
        disponibilizacao_date: n.date,
        matched: process ? 1 : 0,
        raw_json: JSON.stringify(raw)
      });

      if (info.changes === 0) continue; // ja existia (duplicado pelo external_id)
      created += 1;

      const title = process
        ? `Nova movimentação: processo ${n.processNumber}`
        : `Nova intimação recebida (processo ${n.processNumber || 'não identificado'} não cadastrado)`;

      if (process) {
        matched += 1;
        insertUpdate.run(process.id, `[DJEN] ${n.type}: ${n.content}`.slice(0, 2000), n.date);
        insertNotification.run(process.id, title, n.content ? n.content.slice(0, 300) : null);
      } else {
        insertNotification.run(null, title, n.content ? n.content.slice(0, 300) : null);
      }
    }
  });

  tx(items);

  return { fetched: items.length, created, matched };
}

module.exports = { fetchComunicacoes, syncOfficeNotifications, isConfigured };
