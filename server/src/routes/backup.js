const express = require('express');
const db = require('../db');
const { requireAuth, requireAuthFlexible } = require('../middleware/auth');

const router = express.Router();

// Tabelas de dados do escritorio (nao inclui "users" - senhas nao devem ser
// exportadas/reimportadas por esse caminho).
const TABLES = ['clients', 'processes', 'process_updates', 'finance_entries', 'tasks', 'notifications', 'djen_communications', 'integration_settings'];

// Exporta todos os dados em um unico JSON, para guardar no seu computador
// antes de um redeploy (planos gratuitos apagam o banco a cada deploy).
// Usa requireAuthFlexible porque o download e feito por um link direto
// (<a href>), que nao consegue enviar o header Authorization.
router.get('/export', requireAuthFlexible, (req, res) => {
  const dump = { exported_at: new Date().toISOString() };
  for (const table of TABLES) {
    dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  res.setHeader('Content-Disposition', `attachment; filename="backup-ffa-${Date.now()}.json"`);
  res.json(dump);
});

// Restaura um backup exportado por essa mesma rota. Substitui totalmente o
// conteudo das tabelas de dados - use com cuidado.
router.post('/import', requireAuth, (req, res) => {
  const dump = req.body || {};
  const summary = {};

  const tx = db.transaction(() => {
    db.pragma('foreign_keys = OFF');
    for (const table of TABLES) {
      const rows = Array.isArray(dump[table]) ? dump[table] : [];
      db.prepare(`DELETE FROM ${table}`).run();
      if (rows.length) {
        const cols = Object.keys(rows[0]);
        const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((c) => '@' + c).join(',')})`);
        for (const row of rows) stmt.run(row);
      }
      summary[table] = rows.length;
    }
    db.pragma('foreign_keys = ON');
  });

  try {
    tx();
  } catch (err) {
    db.pragma('foreign_keys = ON');
    return res.status(400).json({ error: 'Falha ao importar backup: ' + err.message });
  }
  res.json({ ok: true, restored: summary });
});

module.exports = router;
