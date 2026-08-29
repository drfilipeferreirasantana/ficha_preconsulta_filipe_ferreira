const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const whatsapp = require('../utils/whatsapp');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { unread } = req.query;
  let sql = `
    SELECT notifications.*, processes.number AS process_number, clients.name AS client_name, clients.phone AS client_phone
    FROM notifications
    LEFT JOIN processes ON processes.id = notifications.process_id
    LEFT JOIN clients ON clients.id = processes.client_id
    WHERE 1=1`;
  const params = [];
  if (unread === '1') { sql += ' AND notifications.is_read = 0'; }
  sql += ' ORDER BY notifications.created_at DESC LIMIT 200';
  const rows = db.prepare(sql).all(...params);
  const withLinks = rows.map((n) => ({
    ...n,
    whatsapp_link: n.client_phone ? whatsapp.buildWhatsappLink(n.client_phone, whatsapp.processUpdateMessage({
      clientName: n.client_name, processNumber: n.process_number, description: n.message || n.title
    })) : null
  }));
  res.json(withLinks);
});

router.post('/:id/read', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE is_read = 0').run();
  res.status(204).end();
});

module.exports = router;
