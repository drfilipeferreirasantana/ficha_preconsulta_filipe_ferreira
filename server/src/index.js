require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { installAsyncErrorHandling, friendlyError } = require('./utils/errors');

// Deve vir antes das rotas: erros em rotas async passam a ir para o
// tratador central abaixo em vez de derrubar o servidor.
installAsyncErrorHandling();

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const processRoutes = require('./routes/processes');
const financeRoutes = require('./routes/finance');
const taskRoutes = require('./routes/tasks');
const notificationRoutes = require('./routes/notifications');
const integrationRoutes = require('./routes/integrations');
const backupRoutes = require('./routes/backup');
const templateRoutes = require('./routes/templates');
const publicRoutes = require('./routes/public');
const djen = require('./integrations/djen');
const db = require('./db');

const app = express();
app.use(cors());
// Backups completos (com o texto integral das intimacoes do DJEN) passam
// facilmente de 1 MB - limite maior so para a restauracao.
app.use('/api/backup', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/processes', processRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/templates', templateRoutes);
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
  const { status, message } = friendlyError(err);
  if (status >= 500) console.error(`[erro] ${req.method} ${req.originalUrl}:`, err);
  else console.warn(`[aviso] ${req.method} ${req.originalUrl}: ${err.code || ''} ${err.message}`);
  if (res.headersSent) return next(err);
  res.status(status).json({ error: message });
});

// Ultima linha de defesa: um erro esquecido em tarefa de fundo e
// registrado no log, sem encerrar o servidor para todos os usuarios.
process.on('unhandledRejection', (reason) => {
  console.error('[erro nao tratado]', reason);
});

const PORT = process.env.PORT || 3000;

// O banco (MySQL) precisa estar pronto - tabelas criadas, migracoes e seeds
// aplicados - antes do servidor comecar a aceitar requisicoes.
db.ready()
  .then(() => {
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
  })
  .catch((err) => {
    console.error('[setup] Falha ao preparar o banco de dados MySQL:', err.message);
    process.exit(1);
  });
