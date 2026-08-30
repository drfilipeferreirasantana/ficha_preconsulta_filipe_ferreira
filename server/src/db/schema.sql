-- Esquema do banco de dados do Sistema Filipe Ferreira Advogados
-- SQLite (better-sqlite3)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'advogado', -- admin | advogado | estagiario | financeiro
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  document TEXT,             -- CPF/CNPJ
  phone TEXT,
  email TEXT,
  city TEXT,
  case_type TEXT,            -- motivo principal (divorcio, inventario, etc)
  status TEXT NOT NULL DEFAULT 'lead', -- lead | ativo | inativo | ex_cliente
  origin TEXT DEFAULT 'manual', -- manual | ficha_preconsulta | indicacao
  urgency INTEGER,
  conflict_level INTEGER,
  notes TEXT,                -- descricao do caso / observacoes
  raw_intake_json TEXT,      -- payload completo da ficha de pre-consulta, se houver
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  number TEXT,                 -- numero CNJ do processo
  court TEXT,                  -- ex: TJES, TRF2, TJES-PUMA
  court_system TEXT,           -- pje | puma | esaj | fisico | outro
  subject TEXT,                -- assunto/classe
  phase TEXT,                  -- fase atual (conhecimento, execucao, recursal...)
  status TEXT NOT NULL DEFAULT 'ativo', -- ativo | suspenso | arquivado | encerrado
  responsible TEXT,            -- advogado responsavel
  next_deadline TEXT,          -- proximo prazo (data ISO)
  next_deadline_desc TEXT,
  monitoring_mode TEXT NOT NULL DEFAULT 'manual', -- manual | automatico
  last_sync_at TEXT,
  case_value REAL,             -- valor da causa
  fee_type TEXT,                -- percentual | fixo
  fee_percentage REAL,          -- % sobre o valor da causa/exito, quando fee_type='percentual'
  down_payment REAL,            -- valor de entrada recebido no fechamento do contrato
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS process_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id INTEGER NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT (datetime('now')),
  description TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- manual | pje | puma | esaj
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS finance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  process_id INTEGER REFERENCES processes(id) ON DELETE SET NULL,
  type TEXT NOT NULL,           -- receber | pagar
  category TEXT,                -- honorarios, custas, despesa_fixa, etc
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  due_date TEXT,
  paid_date TEXT,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | pago | atrasado | cancelado
  installment_no INTEGER,
  installment_total INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  process_id INTEGER REFERENCES processes(id) ON DELETE SET NULL,
  assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'media', -- baixa | media | alta | urgente
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | em_andamento | concluida
  is_hearing INTEGER NOT NULL DEFAULT 0,   -- 1 = audiencia/compromisso com hora marcada
  event_start TEXT,                        -- data/hora inicio (ISO local, ex: 2026-09-29T13:40:00)
  event_end TEXT,                          -- data/hora fim
  notify_client INTEGER NOT NULL DEFAULT 0,-- avisar cliente por WhatsApp sobre este evento
  google_event_id TEXT,                    -- id do evento criado no Google Agenda, se conectado
  google_event_link TEXT,                  -- link do evento (htmlLink) retornado pelo Google
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Configuracoes de integracao do escritorio (chave/valor) - usado hoje para
-- guardar o refresh_token do Google Agenda (ver integrations/googleCalendar.js)
CREATE TABLE IF NOT EXISTS integration_settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id INTEGER REFERENCES processes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'sistema', -- sistema | djen | pje | puma | esaj
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Publicacoes/intimacoes recebidas do DJEN (Diario de Justica Eletronico Nacional,
-- comunicaapi.pje.jus.br) - API publica do CNJ, ver server/src/integrations/djen.js
CREATE TABLE IF NOT EXISTS djen_communications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,         -- hash/id retornado pela API, usado para evitar duplicidade
  process_id INTEGER REFERENCES processes(id) ON DELETE SET NULL,
  process_number TEXT,             -- numero do processo informado pelo DJEN
  court TEXT,
  communication_type TEXT,
  content TEXT,
  disponibilizacao_date TEXT,
  matched INTEGER NOT NULL DEFAULT 0, -- 1 se foi vinculado a um processo cadastrado
  raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_processes_client ON processes(client_id);
CREATE INDEX IF NOT EXISTS idx_process_updates_process ON process_updates(process_id);
CREATE INDEX IF NOT EXISTS idx_finance_client ON finance_entries(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_djen_process_number ON djen_communications(process_number);
