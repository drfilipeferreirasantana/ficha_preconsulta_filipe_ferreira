const express = require('express');
const db = require('../db');

const router = express.Router();

// Endpoint sem autenticacao: recebe o envio da ficha de pre-consulta publica
// (public/ficha-preconsulta.html) e cria automaticamente um cliente "lead"
// no sistema, alem do envio tradicional por WhatsApp.
router.post('/leads', async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.phone) {
    return res.status(400).json({ error: 'Nome e telefone sao obrigatorios.' });
  }
  const info = await db.run(`
    INSERT INTO clients (name, phone, email, city, case_type, status, origin, urgency, conflict_level, notes, raw_intake_json)
    VALUES (:name, :phone, :email, :city, :case_type, 'lead', 'ficha_preconsulta', :urgency, :conflict_level, :notes, :raw_intake_json)
  `, {
    name: b.name,
    phone: b.phone,
    email: b.email || null,
    city: b.city || null,
    case_type: b.case_type || null,
    urgency: b.urgency || null,
    conflict_level: b.conflict_level || null,
    notes: b.notes || null,
    raw_intake_json: JSON.stringify(b)
  });
  await db.run(`
    INSERT INTO notifications (title, message, source) VALUES (?, ?, 'sistema')
  `, ['Novo lead recebido', `${b.name} preencheu a ficha de pre-consulta.`]);
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
