const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { status, assigned_to } = req.query;
  let sql = `
    SELECT tasks.*, clients.name AS client_name, users.name AS assigned_name
    FROM tasks
    LEFT JOIN clients ON clients.id = tasks.client_id
    LEFT JOIN users ON users.id = tasks.assigned_to
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND tasks.status = ?'; params.push(status); }
  if (assigned_to) { sql += ' AND tasks.assigned_to = ?'; params.push(assigned_to); }
  sql += ' ORDER BY (tasks.due_date IS NULL), tasks.due_date ASC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Titulo da tarefa e obrigatorio.' });
  const info = db.prepare(`
    INSERT INTO tasks (title, description, client_id, process_id, assigned_to, due_date, priority, status)
    VALUES (@title, @description, @client_id, @process_id, @assigned_to, @due_date, @priority, @status)
  `).run({
    title: b.title,
    description: b.description || null,
    client_id: b.client_id || null,
    process_id: b.process_id || null,
    assigned_to: b.assigned_to || null,
    due_date: b.due_date || null,
    priority: b.priority || 'media',
    status: b.status || 'pendente'
  });
  res.status(201).json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tarefa nao encontrada.' });
  const b = { ...existing, ...req.body, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE tasks SET title=@title, description=@description, assigned_to=@assigned_to,
      due_date=@due_date, priority=@priority, status=@status, updated_at=@updated_at
    WHERE id=@id
  `).run(b);
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
