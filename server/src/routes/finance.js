const express = require('express');
const db = require('../db');
const { requireAuth, requireAuthFlexible } = require('../middleware/auth');
const { renderReceiptHtml } = require('../utils/receipt');
const whatsapp = require('../utils/whatsapp');
const asaas = require('../integrations/asaas');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const { type, status, client_id } = req.query;
  let sql = 'SELECT finance_entries.*, clients.name AS client_name FROM finance_entries LEFT JOIN clients ON clients.id = finance_entries.client_id WHERE 1=1';
  const params = [];
  if (type) { sql += ' AND finance_entries.type = ?'; params.push(type); }
  if (status) { sql += ' AND finance_entries.status = ?'; params.push(status); }
  if (client_id) { sql += ' AND finance_entries.client_id = ?'; params.push(client_id); }
  sql += ' ORDER BY finance_entries.due_date ASC';
  res.json(db.prepare(sql).all(...params));
});

router.get('/summary', requireAuth, (req, res) => {
  const receivable = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='receber' AND status='pendente'`).get().total;
  const overdue = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='receber' AND status='pendente' AND due_date < date('now')`).get().total;
  const payable = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='pagar' AND status='pendente'`).get().total;
  const receivedThisMonth = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='receber' AND status='pago' AND strftime('%Y-%m', paid_date) = strftime('%Y-%m','now')`).get().total;
  const receivedLastMonth = db.prepare(`SELECT COALESCE(SUM(amount),0) AS total FROM finance_entries WHERE type='receber' AND status='pago' AND strftime('%Y-%m', paid_date) = strftime('%Y-%m', date('now','start of month','-1 day'))`).get().total;
  res.json({ receivable, overdue, payable, receivedThisMonth, receivedLastMonth });
});

router.post('/', requireAuth, (req, res) => {
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

router.put('/:id', requireAuth, (req, res) => {
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

router.delete('/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM finance_entries WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// Recibo em HTML (imprimivel / "salvar como PDF" pelo navegador) para um
// lancamento financeiro - usado principalmente para o valor de entrada dos
// honorarios. Usa requireAuthFlexible porque este link e aberto direto em
// nova aba do navegador (sem poder enviar o header Authorization).
router.get('/:id/receipt', requireAuthFlexible, (req, res) => {
  const entry = db.prepare(`
    SELECT finance_entries.*, clients.name AS client_name, clients.document AS client_document,
      processes.number AS process_number
    FROM finance_entries
    LEFT JOIN clients ON clients.id = finance_entries.client_id
    LEFT JOIN processes ON processes.id = finance_entries.process_id
    WHERE finance_entries.id = ?
  `).get(req.params.id);
  if (!entry) return res.status(404).send('Lançamento não encontrado.');

  const html = renderReceiptHtml({
    clientName: entry.client_name || 'Cliente',
    clientDocument: entry.client_document,
    amount: entry.amount,
    description: entry.description,
    processNumber: entry.process_number,
    receiptNumber: String(entry.id).padStart(6, '0'),
    date: entry.paid_date || entry.created_at
  });
  res.set('Content-Type', 'text/html; charset=utf-8').send(html);
});

// Link do WhatsApp avisando o cliente que o recibo esta pronto (o recibo em
// si precisa ser aberto/impresso/salvo e anexado manualmente na conversa -
// o link de "clique para enviar" do WhatsApp so preenche o texto).
router.get('/:id/receipt-whatsapp-link', requireAuth, (req, res) => {
  const entry = db.prepare(`
    SELECT finance_entries.*, clients.name AS client_name, clients.phone AS client_phone
    FROM finance_entries LEFT JOIN clients ON clients.id = finance_entries.client_id
    WHERE finance_entries.id = ?
  `).get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Lancamento nao encontrado.' });
  const link = whatsapp.buildWhatsappLink(entry.client_phone, whatsapp.receiptReadyMessage({
    clientName: entry.client_name, amount: entry.amount
  }));
  res.json({ whatsapp_link: link });
});

// Gera um boleto real via Asaas para um lancamento "a receber". Exige
// ASAAS_API_KEY configurada no servidor (ver integrations/asaas.js) e que o
// lancamento tenha um cliente vinculado.
router.post('/:id/boleto', requireAuth, async (req, res) => {
  const entry = db.prepare('SELECT * FROM finance_entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Lançamento não encontrado.' });
  if (entry.type !== 'receber') return res.status(400).json({ error: 'Boleto só pode ser gerado para lançamentos "a receber".' });
  const client = entry.client_id ? db.prepare('SELECT * FROM clients WHERE id = ?').get(entry.client_id) : null;
  if (!client) return res.status(400).json({ error: 'Este lançamento não tem cliente vinculado.' });
  try {
    const result = await asaas.createBoleto(entry, client);
    res.json(result);
  } catch (err) {
    const status = err.code === 'ASAAS_NOT_CONFIGURED' ? 400 : 502;
    res.status(status).json({ error: err.message });
  }
});

module.exports = router;
