const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { unread } = req.query;
  let sql = `
    SELECT notifications.*, processes.number AS process_number, clients.name AS client_name
    FROM notifications
    LEFT JOIN processes ON processes.id = notifications.process_id
    LEFT JOIN clients ON clients.id = processes.client_id
    WHERE 1=1`;
  const params = [];
  if (unread === '1') { sql += ' AND notifications.is_read = 0'; }
  sql += ' ORDER BY notifications.created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
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
