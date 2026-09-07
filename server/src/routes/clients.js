const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM clients WHERE 1=1';
  const params = [];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (q) {
    sql += ' AND (name LIKE ? OR document LIKE ? OR phone LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY created_at DESC';
  res.json(await db.all(sql, params));
});

router.get('/:id', async (req, res) => {
  const client = await db.get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!client) return res.status(404).json({ error: 'Cliente nao encontrado.' });
  const processes = await db.all('SELECT * FROM processes WHERE client_id = ? ORDER BY created_at DESC', [client.id]);
  const finance = await db.all('SELECT * FROM finance_entries WHERE client_id = ? ORDER BY due_date', [client.id]);
  res.json({ ...client, processes, finance });
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'Nome do cliente e obrigatorio.' });
  const info = await db.run(`
    INSERT INTO clients (name, document, phone, email, city, case_type, status, origin, urgency, conflict_level, notes, raw_intake_json)
    VALUES (:name, :document, :phone, :email, :city, :case_type, :status, :origin, :urgency, :conflict_level, :notes, :raw_intake_json)
  `, {
    name: b.name,
    document: b.document || null,
    phone: b.phone || null,
    email: b.email || null,
    city: b.city || null,
    case_type: b.case_type || null,
    status: b.status || 'lead',
    origin: b.origin || 'manual',
    urgency: b.urgency || null,
    conflict_level: b.conflict_level || null,
    notes: b.notes || null,
    raw_intake_json: b.raw_intake_json || null
  });
  res.status(201).json(await db.get('SELECT * FROM clients WHERE id = ?', [info.lastInsertRowid]));
});

router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Cliente nao encontrado.' });
  const b = { ...existing, ...req.body };
  await db.run(`
    UPDATE clients SET name=:name, document=:document, phone=:phone, email=:email, city=:city,
      case_type=:case_type, status=:status, origin=:origin, urgency=:urgency,
      conflict_level=:conflict_level, notes=:notes
    WHERE id=:id
  `, b);
  res.json(await db.get('SELECT * FROM clients WHERE id = ?', [req.params.id]));
});

router.delete('/:id', async (req, res) => {
  await db.run('DELETE FROM clients WHERE id = ?', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
