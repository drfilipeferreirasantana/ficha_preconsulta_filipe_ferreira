const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const djen = require('../integrations/djen');
const pje = require('../integrations/pje');

const router = express.Router();
router.use(requireAuth);

router.get('/status', (req, res) => {
  res.json({
    djen: { configured: djen.isConfigured() },
    pje_mni: { configured: pje.configured }
  });
});

// Dispara manualmente a busca de novas intimacoes/publicacoes no DJEN
router.post('/djen/sync', async (req, res) => {
  try {
    const days = Number(req.query.days) || 7;
    const result = await djen.syncOfficeNotifications({ days });
    res.json(result);
  } catch (err) {
    const status = err.code === 'DJEN_NOT_CONFIGURED' ? 400 : 502;
    res.status(status).json({ error: err.message });
  }
});

router.get('/djen/communications', (req, res) => {
  const { matched } = req.query;
  let sql = 'SELECT * FROM djen_communications WHERE 1=1';
  const params = [];
  if (matched === '0' || matched === '1') { sql += ' AND matched = ?'; params.push(matched); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
});

module.exports = router;
