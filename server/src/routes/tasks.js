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

// Toda tarefa com uma data (prazo, ou audiencia com hora marcada) sincroniza
// com o Google Agenda, se conectado: audiencias viram evento com horario,
// as demais viram evento de dia inteiro na data do prazo.
async function syncToGoogle(task, { isHearing }) {
  if (!googleCalendar.isConnected()) return { id: null, link: null };
  const hasSchedule = isHearing ? Boolean(task.event_start && task.event_end) : Boolean(task.due_date);
  if (!hasSchedule) return { id: null, link: null };
  try {
    const event = await googleCalendar.createEvent({
      summary: task.title,
      description: task.description || '',
      startDateTime: isHearing ? task.event_start : undefined,
      endDateTime: isHearing ? task.event_end : undefined,
      allDayDate: isHearing ? undefined : task.due_date
    });
    return { id: event.id, link: event.htmlLink };
  } catch (err) {
    console.error('[google-calendar] falha ao criar evento:', err.message);
    return { id: null, link: null };
  }
}

router.post('/', async (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Titulo da tarefa e obrigatorio.' });

  const isHearing = Boolean(b.is_hearing && b.event_start && b.event_end);
  const dueDate = b.due_date || (isHearing ? String(b.event_start).slice(0, 10) : null);

  const google = await syncToGoogle({
    title: b.title, description: b.description, due_date: dueDate,
    event_start: b.event_start, event_end: b.event_end
  }, { isHearing });

  const info = db.prepare(`
    INSERT INTO tasks (title, description, client_id, process_id, assigned_to, due_date, priority, status, is_hearing, event_start, event_end, notify_client, google_event_id, google_event_link)
    VALUES (@title, @description, @client_id, @process_id, @assigned_to, @due_date, @priority, @status, @is_hearing, @event_start, @event_end, @notify_client, @google_event_id, @google_event_link)
  `).run({
    title: b.title,
    description: b.description || null,
    client_id: b.client_id || null,
    process_id: b.process_id || null,
    assigned_to: b.assigned_to || null,
    due_date: dueDate,
    priority: b.priority || 'media',
    status: b.status || 'pendente',
    is_hearing: isHearing ? 1 : 0,
    event_start: isHearing ? b.event_start : null,
    event_end: isHearing ? b.event_end : null,
    notify_client: b.notify_client ? 1 : 0,
    google_event_id: google.id,
    google_event_link: google.link
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
  const isHearing = Boolean(b.is_hearing && b.event_start && b.event_end);
  const hasSchedule = isHearing ? true : Boolean(b.due_date);

  if (googleCalendar.isConnected()) {
    try {
      if (!hasSchedule && existing.google_event_id) {
        // prazo removido - remove o evento tambem
        await googleCalendar.deleteEvent(existing.google_event_id);
        b.google_event_id = null;
        b.google_event_link = null;
      } else if (hasSchedule && existing.google_event_id) {
        const event = await googleCalendar.updateEvent(existing.google_event_id, {
          summary: b.title, description: b.description || '',
          startDateTime: isHearing ? b.event_start : undefined,
          endDateTime: isHearing ? b.event_end : undefined,
          allDayDate: isHearing ? undefined : b.due_date
        });
        b.google_event_link = event.htmlLink;
      } else if (hasSchedule && !existing.google_event_id) {
        const event = await googleCalendar.createEvent({
          summary: b.title, description: b.description || '',
          startDateTime: isHearing ? b.event_start : undefined,
          endDateTime: isHearing ? b.event_end : undefined,
          allDayDate: isHearing ? undefined : b.due_date
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
