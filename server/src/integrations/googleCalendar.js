/**
 * Integracao com o Google Agenda (Google Calendar API v3), via OAuth 2.0.
 *
 * Por que OAuth e nao uma chave simples: o Google exige que o dono da agenda
 * (voce) autorize explicitamente o acesso - nao existe "API key" que crie
 * eventos numa agenda pessoal em nome de outra pessoa. O fluxo é:
 *   1. Voce clica em "Conectar Google Agenda" no sistema.
 *   2. E redirecionado para a tela de permissao do Google, loga e autoriza.
 *   3. O Google devolve um "refresh_token" que o sistema guarda (tabela
 *      integration_settings) e usa para pedir novos "access_token" sempre
 *      que precisar criar/editar um evento - sem pedir login de novo.
 *
 * Pre-requisito (feito por voce, uma vez, no Google Cloud Console):
 *   - Criar um projeto, ativar a "Google Calendar API".
 *   - Configurar a tela de consentimento OAuth (modo "Externo" e "Teste" ja
 *     bastam para uso pessoal).
 *   - Criar uma credencial OAuth Client ID do tipo "Aplicativo da Web",
 *     com redirect URI = <URL do seu sistema>/api/integrations/google/callback
 *   - Colocar CLIENT_ID e CLIENT_SECRET nas variaveis de ambiente
 *     GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI.
 * Passo a passo detalhado no README.md.
 */

const db = require('../db');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || '';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || 'America/Sao_Paulo';

function isConfigured() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REDIRECT_URI);
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM integration_settings WHERE key = ?').get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  db.prepare(`
    INSERT INTO integration_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

function isConnected() {
  return Boolean(getSetting('google_refresh_token'));
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: state || ''
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI, grant_type: 'authorization_code'
    })
  });
  if (!resp.ok) throw new Error(`Falha ao trocar o código pelo token do Google (HTTP ${resp.status}).`);
  return resp.json();
}

async function getAccessToken() {
  const refreshToken = getSetting('google_refresh_token');
  if (!refreshToken) {
    const err = new Error('Google Agenda não conectado. Conecte em Gestão > Google Agenda.');
    err.code = 'GOOGLE_NOT_CONNECTED';
    throw err;
  }
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: 'refresh_token'
    })
  });
  if (!resp.ok) throw new Error(`Falha ao renovar o token do Google (HTTP ${resp.status}).`);
  const data = await resp.json();
  return data.access_token;
}

async function connect(code) {
  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) {
    throw new Error('O Google não devolveu um refresh_token (talvez a conexão já exista - revogue o acesso em myaccount.google.com/permissions e tente novamente).');
  }
  setSetting('google_refresh_token', tokens.refresh_token);
  return true;
}

function disconnect() {
  db.prepare('DELETE FROM integration_settings WHERE key = ?').run('google_refresh_token');
}

async function apiRequest(method, path, body) {
  const accessToken = await getAccessToken();
  const resp = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Erro na API do Google Agenda (HTTP ${resp.status}): ${text.slice(0, 300)}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

// Monta os campos start/end da API do Google Calendar. Duas formas:
//  - evento com hora marcada (startDateTime/endDateTime, ex: audiencias)
//  - evento de dia inteiro (allDayDate = 'YYYY-MM-DD', ex: tarefas com prazo
//    mas sem horario definido) - o Google exige que o "end.date" seja o dia
//    SEGUINTE ao inicio (intervalo exclusivo), mesmo para 1 dia so.
function buildEventTime({ startDateTime, endDateTime, allDayDate }) {
  if (allDayDate) {
    const next = new Date(allDayDate + 'T00:00:00');
    next.setDate(next.getDate() + 1);
    return { start: { date: allDayDate }, end: { date: next.toISOString().slice(0, 10) } };
  }
  return {
    start: { dateTime: startDateTime, timeZone: TIMEZONE },
    end: { dateTime: endDateTime, timeZone: TIMEZONE }
  };
}

async function createEvent({ summary, description, startDateTime, endDateTime, allDayDate }) {
  return apiRequest('POST', '/calendars/primary/events', {
    summary,
    description,
    ...buildEventTime({ startDateTime, endDateTime, allDayDate })
  });
}

async function updateEvent(eventId, { summary, description, startDateTime, endDateTime, allDayDate }) {
  return apiRequest('PATCH', `/calendars/primary/events/${eventId}`, {
    summary,
    description,
    ...buildEventTime({ startDateTime, endDateTime, allDayDate })
  });
}

async function deleteEvent(eventId) {
  try {
    await apiRequest('DELETE', `/calendars/primary/events/${eventId}`);
  } catch (err) {
    // evento pode ja ter sido apagado manualmente na agenda - nao trava o fluxo
    console.warn('[google-calendar] falha ao excluir evento (ignorado):', err.message);
  }
}

module.exports = {
  isConfigured, isConnected, getAuthUrl, connect, disconnect,
  createEvent, updateEvent, deleteEvent
};
