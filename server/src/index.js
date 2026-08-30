require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const processRoutes = require('./routes/processes');
const financeRoutes = require('./routes/finance');
const taskRoutes = require('./routes/tasks');
const notificationRoutes = require('./routes/notifications');
const integrationRoutes = require('./routes/integrations');
const publicRoutes = require('./routes/public');
const djen = require('./integrations/djen');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/processes', processRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/public', publicRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve o frontend estatico (app do sistema + ficha de pre-consulta publica).
// setHeaders evita que o navegador guarde HTML/JS/CSS em cache por muito
// tempo - sem isso, um deploy novo pode "nao aparecer" pro usuario ate ele
// forcar um recarregamento (Ctrl+Shift+R), o que gera confusao.
app.use(express.static(path.join(__dirname, '..', '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sistema Filipe Ferreira Advogados rodando em http://localhost:${PORT}`);

  if (djen.isConfigured()) {
    const intervalHours = Number(process.env.DJEN_SYNC_INTERVAL_HOURS) || 6;
    const runSync = () => {
      djen.syncOfficeNotifications({ days: 7 })
        .then((r) => console.log(`[djen] sync ok - ${r.fetched} comunicacoes, ${r.created} novas, ${r.matched} vinculadas a processos`))
        .catch((err) => console.error('[djen] falha na sincronizacao automatica:', err.message));
    };
    runSync();
    setInterval(runSync, intervalHours * 60 * 60 * 1000);
    console.log(`[djen] sincronizacao automatica ativa a cada ${intervalHours}h (OAB configurada)`);
  } else {
    console.log('[djen] integracao inativa: defina ADVOGADO_OAB_NUMERO e ADVOGADO_OAB_UF no .env para ativar');
  }
});
