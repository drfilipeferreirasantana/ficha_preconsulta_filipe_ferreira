const express = require('express');
const db = require('../db');
const { requireAuth, requireAuthFlexible } = require('../middleware/auth');

const router = express.Router();

// Tabelas de dados do escritorio (nao inclui "users" - senhas nao devem ser
// exportadas/reimportadas por esse caminho).
const TABLES = ['clients', 'processes', 'process_updates', 'finance_entries', 'tasks', 'notifications', 'djen_communications', 'integration_settings'];

// Compatibilidade com backups exportados do sistema antigo (SQLite): a
// coluna "key" da tabela integration_settings foi renomeada para
// "settings_key" no MySQL, ja que KEY e palavra reservada.
function remapLegacyColumns(table, row) {
  if (table === 'integration_settings' && Object.prototype.hasOwnProperty.call(row, 'key')) {
    const { key, ...rest } = row;
    return { settings_key: key, ...rest };
  }
  return row;
}

const NUMERIC_TYPES = new Set(['int', 'tinyint', 'smallint', 'mediumint', 'bigint', 'double', 'float', 'decimal']);
const DATETIME_TYPES = new Set(['datetime', 'timestamp', 'date']);

// O SQLite aceitava qualquer valor em qualquer coluna; o MySQL (modo
// estrito) nao. Adapta cada linha do backup a tabela de destino:
//  - descarta colunas que nao existem mais;
//  - texto vazio em coluna numerica/data vira NULL;
//  - datas no formato ISO do JavaScript ("2026-09-04T17:55:16.123Z")
//    viram o formato do MySQL ("2026-09-04 17:55:16").
function adaptRow(row, types) {
  const out = {};
  for (const [col, value] of Object.entries(row)) {
    const type = types[col];
    if (!type) continue;
    let v = value;
    if (v === '' && (NUMERIC_TYPES.has(type) || DATETIME_TYPES.has(type))) v = null;
    if (typeof v === 'string' && DATETIME_TYPES.has(type)) {
      const m = v.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?/);
      if (m) v = type === 'date' ? m[1] : `${m[1]} ${m[2] || '00:00'}:${m[3] || '00'}`;
    }
    if (typeof v === 'boolean') v = v ? 1 : 0;
    out[col] = v;
  }
  return out;
}

// Exporta todos os dados em um unico JSON, para guardar no seu computador
// antes de um redeploy, ou para migrar de um banco para outro (ex: do SQLite
// antigo para o MySQL). Usa requireAuthFlexible porque o download e feito
// por um link direto (<a href>), que nao consegue enviar o header Authorization.
router.get('/export', requireAuthFlexible, async (req, res) => {
  const dump = { exported_at: new Date().toISOString() };
  for (const table of TABLES) {
    dump[table] = await db.all(`SELECT * FROM ${table}`);
  }
  res.setHeader('Content-Disposition', `attachment; filename="backup-ffa-${Date.now()}.json"`);
  res.json(dump);
});

// Restaura um backup exportado por essa mesma rota. Substitui totalmente o
// conteudo das tabelas de dados - use com cuidado.
router.post('/import', requireAuth, async (req, res) => {
  const dump = req.body || {};
  const summary = {};

  try {
    const typesByTable = {};
    for (const table of TABLES) typesByTable[table] = await db.columnTypes(table);

    await db.transaction(async (tx) => {
      // FOREIGN_KEY_CHECKS vale para a conexao inteira: religa sempre, mesmo
      // em caso de erro, para a conexao voltar ao pool no estado normal.
      await tx.run('SET FOREIGN_KEY_CHECKS = 0');
      try {
        for (const table of TABLES) {
          const rows = (Array.isArray(dump[table]) ? dump[table] : [])
            .map((row) => adaptRow(remapLegacyColumns(table, row), typesByTable[table]));
          await tx.run(`DELETE FROM ${table}`);
          for (const row of rows) {
            const cols = Object.keys(row);
            if (!cols.length) continue;
            await tx.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => ':' + c).join(',')})`, row);
          }
          summary[table] = rows.length;
        }
      } finally {
        await tx.run('SET FOREIGN_KEY_CHECKS = 1');
      }
    });
  } catch (err) {
    return res.status(400).json({ error: 'Falha ao importar backup: ' + err.message });
  }
  res.json({ ok: true, restored: summary });
});

module.exports = router;
