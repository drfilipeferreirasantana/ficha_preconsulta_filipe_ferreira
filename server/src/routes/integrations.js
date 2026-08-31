const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const djen = require('../integrations/djen');
const pje = require('../integrations/pje');
const googleCalendar = require('../integrations/googleCalendar');

const router = express.Router();

router.get('/status', requireAuth, (req, res) => {
  res.json({
    djen: {
      configured: djen.isConfigured(),
      numeroOab: process.env.ADVOGADO_OAB_NUMERO || null,
      ufOab: process.env.ADVOGADO_OAB_UF || null
    },
    pje_mni: { configured: pje.configured },
    google_calendar: { configured: googleCalendar.isConfigured(), connected: googleCalendar.isConnected() }
  });
});

// Diagnostico: tenta uma chamada minima ao DJEN direto do servidor, sem
// gravar nada - usado para descobrir se o servidor (Render) consegue
// alcancar a API (alguns provedores/regioes tomam bloqueio/403).
router.get('/djen/test', requireAuth, async (req, res) => {
  const result = await djen.testConnection();
  res.json(result);
});

// Dispara manualmente a busca de novas intimacoes/publicacoes no DJEN,
// rodando o fetch a partir do PRÓPRIO SERVIDOR. Pode falhar dependendo da
// regiao/provedor de hospedagem - use /djen/test para diagnosticar, ou a
// rota /djen/ingest (fetch feito pelo navegador do usuario) como alternativa.
router.post('/djen/sync', requireAuth, async (req, res) => {
  try {
    const days = Number(req.query.days) || 7;
    const result = await djen.syncOfficeNotifications({ days });
    res.json(result);
  } catch (err) {
    const status = err.code === 'DJEN_NOT_CONFIGURED' ? 400 : 502;
    res.status(status).json({ error: err.message });
  }
});

// Recebe os itens brutos que o NAVEGADOR do usuario buscou diretamente na
// API do DJEN (fetch client-side) e grava usando a mesma logica de
// deduplicacao/vinculacao do sync feito pelo servidor. Existe porque a API
// do DJEN pode bloquear chamadas vindas de fora do Brasil - um navegador
// brasileiro contorna isso, um servidor hospedado fora nao.
router.post('/djen/ingest', requireAuth, (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items) return res.status(400).json({ error: 'Envie { items: [...] } com os itens retornados pela API do DJEN.' });
  try {
    const result = djen.processItems(items);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: 'Falha ao processar itens: ' + err.message });
  }
});

router.get('/djen/communications', requireAuth, (req, res) => {
  const { matched, unread } = req.query;
  let sql = `
    SELECT djen_communications.*, clients.name AS client_name, clients.phone AS client_phone
    FROM djen_communications
    LEFT JOIN processes ON processes.id = djen_communications.process_id
    LEFT JOIN clients ON clients.id = processes.client_id
    WHERE 1=1`;
  const params = [];
  if (matched === '0' || matched === '1') { sql += ' AND djen_communications.matched = ?'; params.push(matched); }
  if (unread === '1') { sql += ' AND djen_communications.is_read = 0'; }
  sql += ' ORDER BY djen_communications.disponibilizacao_date DESC, djen_communications.id DESC LIMIT 300';
  res.json(db.prepare(sql).all(...params));
});

router.post('/djen/communications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE djen_communications SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

router.post('/djen/communications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE djen_communications SET is_read = 1 WHERE is_read = 0').run();
  res.status(204).end();
});

router.delete('/djen/communications/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM djen_communications WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// ---- Google Agenda ----

// Gera a URL de consentimento do Google. O "state" carrega um token de curta
// duracao assinado por nos mesmos, para o /callback conferir que quem voltou
// do Google veio de um clique autorizado neste sistema (o callback nao tem
// como enviar o header Authorization, ja que quem redireciona é o Google).
router.get('/google/auth-url', requireAuth, (req, res) => {
  if (!googleCalendar.isConfigured()) {
    return res.status(400).json({ error: 'Integração com o Google Agenda não configurada no servidor (faltam GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI).' });
  }
  const state = jwt.sign({ purpose: 'google-oauth', userId: req.user.id }, JWT_SECRET, { expiresIn: '10m' });
  res.json({ url: googleCalendar.getAuthUrl(state) });
});

router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).send(`Autorização cancelada ou negada: ${error}`);
  try {
    const payload = jwt.verify(state, JWT_SECRET);
    if (payload.purpose !== 'google-oauth') throw new Error('state inválido');
  } catch (err) {
    return res.status(400).send('Link de autorização inválido ou expirado. Volte ao sistema e clique em "Conectar Google Agenda" novamente.');
  }
  try {
    await googleCalendar.connect(code);
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:3rem">
        <h2>Google Agenda conectado com sucesso!</h2>
        <p>Pode fechar esta aba e voltar ao sistema.</p>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send(`Falha ao conectar: ${err.message}`);
  }
});

router.post('/google/disconnect', requireAuth, (req, res) => {
  googleCalendar.disconnect();
  res.status(204).end();
});

module.exports = router;
