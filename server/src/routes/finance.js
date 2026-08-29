const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { type, status, client_id } = req.query;
  let sql = 'SELECT finance_entries.*, clients.name AS client_name FROM finance_entries LEFT JOIN clients ON clients.id = finance_entries.client_id WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND finance_entries.type = ?'; params.push(type); }
  if (status) { sql += ' AND finance_entries.status = ?'; params.push(status); }
  if (client_id) { sql += ' AND finance_entries.client_id = ?'; params.push(client_id); }
  sql += ' ORDER BY finance_entries.due_date ASC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/summary', (req, res) => {
  const receivable = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='receber' AND status='pendente'`).get().total;
  const overdue = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='receber' AND status='pendente' AND due_date < date('now')`).get().total;
  const payable = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='pagar' AND status='pendente'`).get().total;
  const receivedThisMonth = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='receber' AND status='pago' AND strftime('%Y-%m', paid_date) = strftime('%Y-%m','now')`).get().total;
  res.json({ receivable, overdue, payable, receivedThisMonth });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.description || !b.amount || !b.type) {
    return res.status(400).json({ error: 'Descricao, valor e tipo (receber/pagar) sao obrigatorios.' });
  }
  const info = db.prepare(`
    INSERT INTO finance_entries (client_id, process_id, type, category, description, amount, due_date, status, installment_no, installment_total)
    VALUES (@client_id, @process_id, @type, @category, @description, @amount, @due_date, @status, @installment_no, @installment_total)
  `).run({
    client_id: b.client_id || null,
    process_id: b.process_id || null,
    type: b.type,
    category: b.category || null,
    description: b.description,
    amount: b.amount,
    due_date: b.due_date || null,
    status: b.status || 'pendente',
    installment_no: b.installment_no || null,
    installment_total: b.installment_total || null
  });
  res.status(201).json(db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Lancamento nao encontrado.' });
  const b = { ...existing, ...req.body, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE finance_entries SET category=@category, description=@description, amount=@amount,
      due_date=@due_date, paid_date=@paid_date, status=@status, updated_at=@updated_at
    WHERE id=@id
  `).run(b);
  res.json(db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM finance_entries WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
