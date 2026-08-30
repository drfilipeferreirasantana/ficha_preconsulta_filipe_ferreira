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
    djen: { configured: djen.isConfigured() },
    pje_mni: { configured: pje.configured },
    google_calendar: { configured: googleCalendar.isConfigured(), connected: googleCalendar.isConnected() }
  });
});

// Dispara manualmente a busca de novas intimacoes/publicacoes no DJEN
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

router.get('/djen/communications', requireAuth, (req, res) => {
  const { matched } = req.query;
  let sql = 'SELECT * FROM djen_communications WHERE 1=1';
  const params = [];
  if (matched === '0' || matched === '1') { sql += ' AND matched = ?'; params.push(matched); }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  res.json(db.prepare(sql).all(...params));
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
