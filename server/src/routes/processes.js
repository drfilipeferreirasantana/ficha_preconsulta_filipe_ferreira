const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const pje = require('../integrations/pje');
const whatsapp = require('../utils/whatsapp');

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
    SELECT processes.*, clients.name AS client_name, clients.phone AS client_phone FROM processes
    JOIN clients ON clients.id = processes.client_id WHERE processes.id = ?
  `).get(req.params.id);
  if (!process) return res.status(404).json({ error: 'Processo nao encontrado.' });
  const updates = db.prepare('SELECT * FROM process_updates WHERE process_id = ? ORDER BY date DESC').all(process.id);
  const finance = db.prepare('SELECT * FROM finance_entries WHERE process_id = ? ORDER BY due_date').all(process.id);
  res.json({ ...process, updates, finance });
});

/**
 * Cria um processo. Duas formas de informar o cliente:
 *  - client_id: vincula a um cliente ja cadastrado
 *  - new_client: { name, phone, email, city, document } cria o cliente junto
 *
 * Tambem aceita os campos de honorarios:
 *  - case_value: valor da causa
 *  - fee_type: 'percentual' | 'fixo'
 *  - fee_percentage: usado quando fee_type='percentual' (gera 1 lancamento
 *    "a receber" estimado, pendente, ate o exito ser confirmado)
 *  - down_payment: valor de entrada recebido no fechamento (gera lancamento
 *    "a receber" ja pago + recibo)
 *  - fixed_fees: [{ description, amount, due_date }] usado quando
 *    fee_type='fixo' para lancar os valores/parcelas a receber
 */
router.post('/', (req, res) => {
  const b = req.body || {};
  if (!b.client_id && !b.new_client) {
    return res.status(400).json({ error: 'Informe um cliente existente (client_id) ou os dados de um novo cliente (new_client).' });
  }

  const tx = db.transaction(() => {
    let clientId = b.client_id;
    if (!clientId) {
      const nc = b.new_client;
      if (!nc.name || !nc.phone) throw new Error('Nome e telefone do novo cliente sao obrigatorios.');
      const info = db.prepare(`
        INSERT INTO clients (name, document, phone, email, city, status, origin)
        VALUES (@name, @document, @phone, @email, @city, 'ativo', 'manual')
      `).run({
        name: nc.name, document: nc.document || null, phone: nc.phone,
        email: nc.email || null, city: nc.city || null
      });
      clientId = info.lastInsertRowid;
    }

    const processInfo = db.prepare(`
      INSERT INTO processes (client_id, number, court, court_system, subject, phase, status, responsible, next_deadline, next_deadline_desc, monitoring_mode, case_value, fee_type, fee_percentage, down_payment)
      VALUES (@client_id, @number, @court, @court_system, @subject, @phase, @status, @responsible, @next_deadline, @next_deadline_desc, @monitoring_mode, @case_value, @fee_type, @fee_percentage, @down_payment)
    `).run({
      client_id: clientId,
      number: b.number || null,
      court: b.court || null,
      court_system: b.court_system || 'outro',
      subject: b.subject || null,
      phase: b.phase || null,
      status: b.status || 'ativo',
      responsible: b.responsible || null,
      next_deadline: b.next_deadline || null,
      next_deadline_desc: b.next_deadline_desc || null,
      monitoring_mode: b.monitoring_mode || 'manual',
      case_value: b.case_value || null,
      fee_type: b.fee_type || null,
      fee_percentage: b.fee_type === 'percentual' ? (b.fee_percentage || null) : null,
      down_payment: b.down_payment || null
    });
    const processId = processInfo.lastInsertRowid;

    const financeInserted = [];
    const insertFinance = db.prepare(`
      INSERT INTO finance_entries (client_id, process_id, type, category, description, amount, due_date, status, paid_date)
      VALUES (@client_id, @process_id, 'receber', @category, @description, @amount, @due_date, @status, @paid_date)
    `);

    // Entrada recebida no fechamento do contrato
    if (b.down_payment && Number(b.down_payment) > 0) {
      const info = insertFinance.run({
        client_id: clientId, process_id: processId,
        category: 'entrada', description: `Entrada - honorários${b.number ? ' (processo ' + b.number + ')' : ''}`,
        amount: Number(b.down_payment), due_date: null, status: 'pago',
        paid_date: new Date().toISOString().slice(0, 10)
      });
      financeInserted.push({ id: info.lastInsertRowid, kind: 'entrada' });
    }

    // Honorarios: percentual sobre o valor da causa/exito -> lancamento estimado, pendente
    if (b.fee_type === 'percentual' && b.fee_percentage && b.case_value) {
      const estimated = Number(b.case_value) * (Number(b.fee_percentage) / 100);
      const info = insertFinance.run({
        client_id: clientId, process_id: processId,
        category: 'honorarios_exito',
        description: `Honorários estimados (${b.fee_percentage}% sobre valor da causa) - a confirmar no êxito`,
        amount: estimated, due_date: null, status: 'pendente', paid_date: null
      });
      financeInserted.push({ id: info.lastInsertRowid, kind: 'honorarios_exito' });
    }

    // Honorarios fixos: lista de valores/parcelas a receber
    if (b.fee_type === 'fixo' && Array.isArray(b.fixed_fees)) {
      for (const fee of b.fixed_fees) {
        if (!fee.amount) continue;
        const info = insertFinance.run({
          client_id: clientId, process_id: processId,
          category: 'honorarios',
          description: fee.description || `Honorários${b.number ? ' - processo ' + b.number : ''}`,
          amount: Number(fee.amount), due_date: fee.due_date || null, status: 'pendente', paid_date: null
        });
        financeInserted.push({ id: info.lastInsertRowid, kind: 'honorarios' });
      }
    }

    return { clientId, processId, financeInserted };
  });

  let result;
  try {
    result = tx();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.clientId);
  const process = db.prepare('SELECT * FROM processes WHERE id = ?').get(result.processId);
  const finance = result.financeInserted.length
    ? db.prepare(`SELECT * FROM finance_entries WHERE id IN (${result.financeInserted.map(() => '?').join(',')})`).all(...result.financeInserted.map((f) => f.id))
    : [];

  const receiptEntry = result.financeInserted.find((f) => f.kind === 'entrada');

  res.status(201).json({
    client,
    process,
    finance,
    whatsapp_link: whatsapp.buildWhatsappLink(client.phone, whatsapp.processRegisteredMessage({
      clientName: client.name, processNumber: process.number, court: process.court
    })),
    receipt_url: receiptEntry ? `/api/finance/${receiptEntry.id}/receipt` : null
  });
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM processes WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Processo nao encontrado.' });
  const b = { ...existing, ...req.body, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE processes SET number=@number, court=@court, court_system=@court_system, subject=@subject,
      phase=@phase, status=@status, responsible=@responsible, next_deadline=@next_deadline,
      next_deadline_desc=@next_deadline_desc, monitoring_mode=@monitoring_mode,
      case_value=@case_value, fee_type=@fee_type, fee_percentage=@fee_percentage, down_payment=@down_payment,
      updated_at=@updated_at
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

  const process = db.prepare(`
    SELECT processes.*, clients.name AS client_name, clients.phone AS client_phone
    FROM processes JOIN clients ON clients.id = processes.client_id WHERE processes.id = ?
  `).get(req.params.id);

  res.status(201).json({
    update: db.prepare('SELECT * FROM process_updates WHERE id = ?').get(info.lastInsertRowid),
    whatsapp_link: process ? whatsapp.buildWhatsappLink(process.client_phone, whatsapp.processUpdateMessage({
      clientName: process.client_name, processNumber: process.number, description
    })) : null
  });
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
