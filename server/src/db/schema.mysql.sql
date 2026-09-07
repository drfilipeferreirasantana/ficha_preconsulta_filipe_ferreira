-- Esquema do banco de dados do Sistema Filipe Ferreira Advogados
-- MySQL / MariaDB (driver mysql2)

CREATE TABLE IF NOT EXISTS users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'advogado', -- admin | advogado | estagiario | financeiro
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clients (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  document VARCHAR(50),      -- CPF/CNPJ
  phone VARCHAR(30),
  email VARCHAR(255),
  city VARCHAR(255),
  case_type VARCHAR(100),    -- motivo principal (divorcio, inventario, etc)
  status VARCHAR(30) NOT NULL DEFAULT 'lead', -- lead | ativo | inativo | ex_cliente
  origin VARCHAR(30) DEFAULT 'manual', -- manual | ficha_preconsulta | indicacao
  urgency INT,
  conflict_level INT,
  notes TEXT,                -- descricao do caso / observacoes
  raw_intake_json LONGTEXT,  -- payload completo da ficha de pre-consulta, se houver
  asaas_customer_id VARCHAR(60), -- id do cliente no gateway de pagamento (Asaas), se ja criado
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS processes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT NOT NULL,
  number VARCHAR(60),           -- numero CNJ do processo
  court VARCHAR(60),            -- ex: TJES, TRF2, TJES-PUMA
  court_system VARCHAR(30),     -- pje | puma | esaj | fisico | outro
  subject VARCHAR(255),         -- assunto/classe
  phase VARCHAR(100),           -- fase atual (conhecimento, execucao, recursal...)
  status VARCHAR(30) NOT NULL DEFAULT 'ativo', -- ativo | suspenso | arquivado | encerrado
  responsible VARCHAR(255),     -- advogado responsavel (nome, para exibicao)
  responsible_user_id INT,      -- vinculo com usuario do sistema, se houver
  next_deadline VARCHAR(20),    -- proximo prazo (data ISO)
  next_deadline_desc VARCHAR(255),
  monitoring_mode VARCHAR(20) NOT NULL DEFAULT 'manual', -- manual | automatico
  last_sync_at DATETIME,
  last_monitor_status VARCHAR(30), -- sucesso | sem_movimentacao | erro
  last_monitor_error TEXT,
  last_movement_date VARCHAR(20),
  case_value DOUBLE,            -- valor da causa
  fee_type VARCHAR(20),          -- percentual | fixo
  fee_percentage DOUBLE,         -- % sobre o valor da causa/exito, quando fee_type='percentual'
  down_payment DOUBLE,           -- valor de entrada recebido no fechamento do contrato
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_processes_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_processes_responsible_user FOREIGN KEY (responsible_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS process_updates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  process_id INT NOT NULL,
  date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  description TEXT NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'manual', -- manual | pje | puma | esaj
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_process_updates_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_entries (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_id INT,
  process_id INT,
  type VARCHAR(20) NOT NULL,     -- receber | pagar
  category VARCHAR(60),          -- honorarios, custas, despesa_fixa, etc
  description TEXT NOT NULL,
  amount DOUBLE NOT NULL,
  due_date VARCHAR(20),
  paid_date VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | pago | atrasado | cancelado
  installment_no INT,
  installment_total INT,
  asaas_charge_id VARCHAR(60),  -- id da cobranca no Asaas, se um boleto foi gerado
  boleto_url VARCHAR(500),      -- link para visualizar/baixar o boleto gerado
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_finance_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_finance_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Modelos de documentos (peticoes, contratos, procuracoes) reaproveitaveis.
-- body_html aceita placeholders tipo {{cliente_nome}} substituidos na geracao.
CREATE TABLE IF NOT EXISTS document_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(60),      -- ex: peticao, contrato, procuracao
  body_html LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tasks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  client_id INT,
  process_id INT,
  assigned_to INT,
  due_date VARCHAR(20),
  priority VARCHAR(20) NOT NULL DEFAULT 'media', -- baixa | media | alta | urgente
  status VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | em_andamento | concluida
  is_hearing TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = audiencia/compromisso com hora marcada
  event_start VARCHAR(30),                    -- data/hora inicio (ISO local, ex: 2026-09-29T13:40:00)
  event_end VARCHAR(30),                      -- data/hora fim
  notify_client TINYINT(1) NOT NULL DEFAULT 0,-- avisar cliente por WhatsApp sobre este evento
  google_event_id VARCHAR(255),               -- id do evento criado no Google Agenda, se conectado
  google_event_link VARCHAR(500),             -- link do evento (htmlLink) retornado pelo Google
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tasks_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL,
  CONSTRAINT fk_tasks_assigned FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Configuracoes de integracao do escritorio (chave/valor) - usado hoje para
-- guardar o refresh_token do Google Agenda (ver integrations/googleCalendar.js)
CREATE TABLE IF NOT EXISTS integration_settings (
  settings_key VARCHAR(100) PRIMARY KEY,
  value LONGTEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  process_id INT,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'sistema', -- sistema | djen | pje | puma | esaj
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Publicacoes/intimacoes recebidas do DJEN (Diario de Justica Eletronico Nacional,
-- comunicaapi.pje.jus.br) - API publica do CNJ, ver server/src/integrations/djen.js
CREATE TABLE IF NOT EXISTS djen_communications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  external_id VARCHAR(255) UNIQUE, -- "id" retornado pela API do DJEN, usado para evitar duplicidade
  process_id INT,
  process_number VARCHAR(60),      -- numero do processo com mascara (numeroprocessocommascara)
  court VARCHAR(60),               -- siglaTribunal
  communication_type VARCHAR(100), -- tipoComunicacao
  org_name VARCHAR(255),           -- nomeOrgao
  class_name VARCHAR(255),         -- nomeClasse
  content LONGTEXT,                -- texto (HTML removido)
  link VARCHAR(500),               -- link para o documento oficial (pode ser nulo em sigilo)
  sigiloso TINYINT(1) NOT NULL DEFAULT 0, -- 1 se algum destinatario aparece em segredo de justica
  disponibilizacao_date VARCHAR(20),
  matched TINYINT(1) NOT NULL DEFAULT 0, -- 1 se foi vinculado a um processo cadastrado
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  raw_json LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_djen_process FOREIGN KEY (process_id) REFERENCES processes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_processes_client ON processes(client_id);
CREATE INDEX idx_process_updates_process ON process_updates(process_id);
CREATE INDEX idx_finance_client ON finance_entries(client_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_djen_process_number ON djen_communications(process_number);
