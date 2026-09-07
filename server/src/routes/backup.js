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
    await db.transaction(async (tx) => {
      await tx.run('SET FOREIGN_KEY_CHECKS = 0');
      for (const table of TABLES) {
        const rows = (Array.isArray(dump[table]) ? dump[table] : []).map((row) => remapLegacyColumns(table, row));
        await tx.run(`DELETE FROM ${table}`);
        if (rows.length) {
          const cols = Object.keys(rows[0]);
          const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => ':' + c).join(',')})`;
          for (const row of rows) await tx.run(sql, row);
        }
        summary[table] = rows.length;
      }
      await tx.run('SET FOREIGN_KEY_CHECKS = 1');
    });
  } catch (err) {
    await db.run('SET FOREIGN_KEY_CHECKS = 1');
    return res.status(400).json({ error: 'Falha ao importar backup: ' + err.message });
  }
  res.json({ ok: true, restored: summary });
});

module.exports = router;
