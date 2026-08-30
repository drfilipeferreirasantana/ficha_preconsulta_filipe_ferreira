const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const googleCalendar = require('../integrations/googleCalendar');
const whatsapp = require('../utils/whatsapp');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const { status, assigned_to } = req.query;
  let sql = `
    SELECT tasks.*, clients.name AS client_name, clients.phone AS client_phone, users.name AS assigned_name
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

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Titulo da tarefa e obrigatorio.' });

  const isHearing = Boolean(b.is_hearing && b.event_start && b.event_end);
  let googleEventId = null;
  let googleEventLink = null;

  if (isHearing && googleCalendar.isConnected()) {
    try {
      const event = await googleCalendar.createEvent({
        summary: b.title,
        description: b.description || '',
        startDateTime: b.event_start,
        endDateTime: b.event_end
      });
      googleEventId = event.id;
      googleEventLink = event.htmlLink;
    } catch (err) {
      console.error('[google-calendar] falha ao criar evento:', err.message);
    }
  }

  const info = db.prepare(`
    INSERT INTO tasks (title, description, client_id, process_id, assigned_to, due_date, priority, status, is_hearing, event_start, event_end, notify_client, google_event_id, google_event_link)
    VALUES (@title, @description, @client_id, @process_id, @assigned_to, @due_date, @priority, @status, @is_hearing, @event_start, @event_end, @notify_client, @google_event_id, @google_event_link)
  `).run({
    title: b.title,
    description: b.description || null,
    client_id: b.client_id || null,
    process_id: b.process_id || null,
    assigned_to: b.assigned_to || null,
    due_date: b.due_date || (isHearing ? String(b.event_start).slice(0, 10) : null),
    priority: b.priority || 'media',
    status: b.status || 'pendente',
    is_hearing: isHearing ? 1 : 0,
    event_start: isHearing ? b.event_start : null,
    event_end: isHearing ? b.event_end : null,
    notify_client: b.notify_client ? 1 : 0,
    google_event_id: googleEventId,
    google_event_link: googleEventLink
  });

  const task = db.prepare('SELECT tasks.*, clients.name AS client_name, clients.phone AS client_phone FROM tasks LEFT JOIN clients ON clients.id = tasks.client_id WHERE tasks.id = ?').get(info.lastInsertRowid);

  let whatsappLink = null;
  if (isHearing && b.notify_client && task.client_phone) {
    whatsappLink = whatsapp.buildWhatsappLink(task.client_phone, whatsapp.hearingScheduledMessage({
      clientName: task.client_name,
      title: task.title,
      startDateTime: task.event_start,
      endDateTime: task.event_end,
      eventLink: task.google_event_link
    }));
  }

  res.status(201).json({ task, whatsapp_link: whatsappLink, google_connected: googleCalendar.isConnected() });
});

router.put('/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tarefa nao encontrada.' });
  const b = { ...existing, ...req.body, updated_at: new Date().toISOString() };

  if (b.is_hearing && b.event_start && b.event_end && googleCalendar.isConnected()) {
    try {
      if (existing.google_event_id) {
        const event = await googleCalendar.updateEvent(existing.google_event_id, {
          summary: b.title, description: b.description || '', startDateTime: b.event_start, endDateTime: b.event_end
        });
        b.google_event_link = event.htmlLink;
      } else {
        const event = await googleCalendar.createEvent({
          summary: b.title, description: b.description || '', startDateTime: b.event_start, endDateTime: b.event_end
        });
        b.google_event_id = event.id;
        b.google_event_link = event.htmlLink;
      }
    } catch (err) {
      console.error('[google-calendar] falha ao sincronizar evento:', err.message);
    }
  }

  db.prepare(`
    UPDATE tasks SET title=@title, description=@description, assigned_to=@assigned_to,
      due_date=@due_date, priority=@priority, status=@status, is_hearing=@is_hearing,
      event_start=@event_start, event_end=@event_end, notify_client=@notify_client,
      google_event_id=@google_event_id, google_event_link=@google_event_link, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...b, is_hearing: b.is_hearing ? 1 : 0, notify_client: b.notify_client ? 1 : 0 });
  res.json(db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id));
});

router.delete('/:id', async (req, res) => {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (existing && existing.google_event_id && googleCalendar.isConnected()) {
    await googleCalendar.deleteEvent(existing.google_event_id);
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
