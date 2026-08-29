const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const pje = require('../integrations/pje');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { status, client_id, upcoming } = req.query;
  let sql = `
    SELECT processes.*, clients.name AS client_name
    FROM processes JOIN clients ON clients.id = processes.client_id
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND processes.status = ?'; params.push(status); }
  if (client_id) { sql += ' AND processes.client_id = ?'; params.push(client_id); }
  if (upcoming) { sql += " AND processes.next_deadline IS NOT NULL AND date(processes.next_deadline) <= date('now', '+' || ? || ' days')"; params.push(Number(upcoming) || 7); }
  sql += ' ORDER BY (processes.next_deadline IS NULL), processes.next_deadline ASC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/:id', (req, res) => {
  const process = db.prepare(`
    SELECT processes.*, clients.name AS client_name FROM processes
    JOIN clients ON clients.id = processes.client_id WHERE processes.id = ?
  `).get(req.params.id);
  if (!process) return res.status(404).json({ error: 'Processo nao encontrado.' });
  const updates = db.prepare('SELECT * FROM process_updates WHERE process_id = ? ORDER BY date DESC').all(process.id);
  res.json({ ...process, updates });
});

router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.client_id) return res.status(400).json({ error: 'Informe o cliente do processo.' });
  const info = db.prepare(`
    INSERT INTO processes (client_id, number, court, court_system, subject, phase, status, responsible, next_deadline, next_deadline_desc, monitoring_mode)
    VALUES (@client_id, @number, @court, @court_system, @subject, @phase, @status, @responsible, @next_deadline, @next_deadline_desc, @monitoring_mode)
  `).run({
    client_id: b.client_id,
    number: b.number || null,
    court: b.court || null,
    court_system: b.court_system || 'outro',
    subject: b.subject || null,
    phase: b.phase || null,
    status: b.status || 'ativo',
    responsible: b.responsible || null,
    next_deadline: b.next_deadline || null,
    next_deadline_desc: b.next_deadline_desc || null,
    monitoring_mode: b.monitoring_mode || 'manual'
  });
  res.status(201).json(db.prepare('SELECT * FROM processes WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM processes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Processo nao encontrado.' });
  const b = { ...existing, ...req.body, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE processes SET number=@number, court=@court, court_system=@court_system, subject=@subject,
      phase=@phase, status=@status, responsible=@responsible, next_deadline=@next_deadline,
      next_deadline_desc=@next_deadline_desc, monitoring_mode=@monitoring_mode, updated_at=@updated_at
    WHERE id=@id
  `).run(b);
  res.json(db.prepare('SELECT * FROM processes WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM processes WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Andamentos (historico) de um processo
router.post('/:id/updates', (req, res) => {
  const { description, date, source } = req.body || {};
  if (!description) return res.status(400).json({ error: 'Descreva o andamento.' });
  const info = db.prepare(`
    INSERT INTO process_updates (process_id, description, date, source) VALUES (?, ?, COALESCE(?, datetime('now')), ?)
  `).run(req.params.id, description, date || null, source || 'manual');
  res.status(201).json(db.prepare('SELECT * FROM process_updates WHERE id = ?').get(info.lastInsertRowid));
});

// Dispara uma tentativa de sincronizacao automatica via integracao do tribunal (ver integrations/pje.js)
router.post('/:id/sync', async (req, res) => {
  const process = db.prepare('SELECT * FROM processes WHERE id = ?').get(req.params.id);
  if (!process) return res.status(404).json({ error: 'Processo nao encontrado.' });
  try {
    const result = await pje.syncProcess(process);
    res.json(result);
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

module.exports = router;
