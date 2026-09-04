const express = require('express');
const db = require('../db');
const { requireAuth, requireAuthFlexible } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM document_templates ORDER BY title').all());
});

router.get('/:id', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'Modelo não encontrado.' });
  res.json(t);
});

router.post('/', requireAuth, (req, res) => {
  const { title, category, body_html } = req.body || {};
  if (!title || !body_html) return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
  const info = db.prepare(`
    INSERT INTO document_templates (title, category, body_html) VALUES (?, ?, ?)
  `).run(title, category || null, body_html);
  res.status(201).json(db.prepare('SELECT * FROM document_templates WHERE id = ?').get(info.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Modelo não encontrado.' });
  const b = { ...existing, ...req.body, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE document_templates SET title=@title, category=@category, body_html=@body_html, updated_at=@updated_at
    WHERE id=@id
  `).run(b);
  res.json(db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id));
});

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM document_templates WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

function fillPlaceholders(html, data) {
  return html.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (data[key] !== undefined && data[key] !== null ? String(data[key]) : ''));
}

// Gera o documento preenchido para um cliente (e opcionalmente processo),
// como HTML pronto para imprimir/"salvar como PDF" - mesma abordagem do
// recibo. Usa requireAuthFlexible porque e aberto direto em nova aba.
router.get('/:id/generate', requireAuthFlexible, (req, res) => {
  const template = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(req.params.id);
  if (!template) return res.status(404).send('Modelo não encontrado.');

  const { client_id, process_id } = req.query;
  const client = client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id) : null;
  const process = process_id ? db.prepare('SELECT * FROM processes WHERE id = ?').get(process_id) : null;

  const data = {
    cliente_nome: client ? client.name : '',
    cliente_documento: client ? client.document || '' : '',
    cliente_email: client ? client.email || '' : '',
    cliente_telefone: client ? client.phone || '' : '',
    cliente_endereco: client ? client.city || '' : '',
    processo_numero: process ? process.number || '' : '',
    processo_tribunal: process ? process.court || '' : '',
    processo_assunto: process ? process.subject || '' : '',
    data_hoje: new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    advogado_nome: 'Filipe Ferreira'
  };

  const filledBody = fillPlaceholders(template.body_html, data);
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${template.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  body{font-family:'Montserrat',Georgia,serif;background:#f2f2f2;margin:0;padding:2rem}
  .sheet{max-width:800px;margin:0 auto;background:#fff;padding:3rem;border:1px solid #ddd;font-size:14px;line-height:1.8;color:#222}
  .sheet h1,.sheet h2,.sheet h3{color:#39414a}
  @media print{body{background:#fff;padding:0}.sheet{border:none}}
</style>
</head>
<body>
  <div class="sheet">${filledBody}</div>
</body>
</html>`;
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

module.exports = router;
