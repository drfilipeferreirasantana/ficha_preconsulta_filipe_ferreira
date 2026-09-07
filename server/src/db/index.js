const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

/**
 * Banco de dados: MySQL (ex: banco criado na hospedagem Hostinger).
 *
 * Variaveis de ambiente esperadas (ver server/.env.example):
 *   DB_HOST, DB_PORT (padrao 3306), DB_USER, DB_PASSWORD, DB_NAME
 *
 * O driver mysql2 é assíncrono (toda chamada ao banco é uma promise) -
 * por isso as funcoes abaixo (query/run/get/all) sempre retornam promises e
 * devem ser usadas com "await" nas rotas.
 */

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ffa',
  namedPlaceholders: true,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10
});

// Executa uma query e devolve so as linhas (SELECT).
async function all(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Executa uma query e devolve so a primeira linha, ou undefined.
async function get(sql, params) {
  const rows = await all(sql, params);
  return rows[0];
}

// Executa um INSERT/UPDATE/DELETE. Devolve { lastInsertRowid, changes } no
// mesmo formato que as rotas ja esperavam do better-sqlite3.
async function run(sql, params) {
  const [result] = await pool.query(sql, params);
  return { lastInsertRowid: result.insertId, changes: result.affectedRows };
}

// Executa um lote de operacoes dentro de uma transacao MySQL. `fn` recebe um
// objeto com run/get/all iguais aos acima, mas presos a mesma conexao/transacao.
async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const txDb = {
      run: async (sql, params) => {
        const [result] = await conn.query(sql, params);
        return { lastInsertRowid: result.insertId, changes: result.affectedRows };
      },
      get: async (sql, params) => {
        const [rows] = await conn.query(sql, params);
        return rows[0];
      },
      all: async (sql, params) => {
        const [rows] = await conn.query(sql, params);
        return rows;
      }
    };
    const result = await fn(txDb);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Migracao leve e idempotente: adiciona colunas novas em bancos ja
// existentes (CREATE TABLE IF NOT EXISTS acima nao altera tabelas que ja
// existem) - equivalente ao que era feito com PRAGMA table_info no SQLite.
async function ensureColumns(table, columns) {
  const existingRows = await all(
    'SELECT COLUMN_NAME AS name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  );
  const existing = new Set(existingRows.map((c) => c.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}

async function ensureIndex(sql) {
  try {
    await pool.query(sql);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }
}

let readyPromise = null;

// Prepara o banco: cria as tabelas (se nao existirem), aplica migracoes
// idempotentes e semeia dados iniciais (usuario admin, modelo de documento
// padrao). Deve ser aguardado (await db.ready()) antes do servidor comecar
// a aceitar requisicoes.
async function setup() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.mysql.sql'), 'utf8');
  // Remove comentarios de linha (-- ...) antes de executar: o driver, com
  // namedPlaceholders ligado, escaneia o texto inteiro da query em busca de
  // ":algo" - um comentario como "-- ex: TJES" seria confundido com um
  // placeholder nomeado sem parametro correspondente.
  const withoutComments = schema.replace(/--.*$/gm, '');
  const statements = withoutComments
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    if (/^CREATE INDEX/i.test(statement)) {
      await ensureIndex(statement);
    } else {
      await pool.query(statement);
    }
  }

  await ensureColumns('processes', {
    case_value: 'DOUBLE',
    fee_type: 'VARCHAR(20)',
    fee_percentage: 'DOUBLE',
    down_payment: 'DOUBLE',
    last_monitor_status: 'VARCHAR(30)',
    last_monitor_error: 'TEXT',
    last_movement_date: 'VARCHAR(20)',
    responsible_user_id: 'INT'
  });
  await ensureColumns('clients', {
    asaas_customer_id: 'VARCHAR(60)'
  });
  await ensureColumns('finance_entries', {
    asaas_charge_id: 'VARCHAR(60)',
    boleto_url: 'VARCHAR(500)'
  });
  await ensureColumns('djen_communications', {
    org_name: 'VARCHAR(255)',
    class_name: 'VARCHAR(255)',
    link: 'VARCHAR(500)',
    sigiloso: 'TINYINT(1) NOT NULL DEFAULT 0',
    is_read: 'TINYINT(1) NOT NULL DEFAULT 0'
  });
  await ensureColumns('tasks', {
    is_hearing: 'TINYINT(1) NOT NULL DEFAULT 0',
    event_start: 'VARCHAR(30)',
    event_end: 'VARCHAR(30)',
    notify_client: 'TINYINT(1) NOT NULL DEFAULT 0',
    google_event_id: 'VARCHAR(255)',
    google_event_link: 'VARCHAR(500)'
  });

  // Cria o usuario administrador no primeiro start, se ainda nao houver nenhum usuario
  const userCount = (await get('SELECT COUNT(*) AS c FROM users')).c;
  if (userCount === 0) {
    const name = process.env.ADMIN_NAME || 'Administrador';
    const email = process.env.ADMIN_EMAIL || 'admin@escritorio.com';
    const password = process.env.ADMIN_PASSWORD || 'mudar123';
    const hash = bcrypt.hashSync(password, 10);
    await run('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, email, hash, 'admin']);
    console.log(`[setup] Usuario admin criado: ${email} (troque a senha padrao assim que possivel)`);
  }

  // Modelo de documento padrao (Procuracao Ad Judicia) - inserido uma unica vez,
  // caso ainda nao exista um modelo com o mesmo titulo (permite o usuario editar
  // ou apagar pela tela "Modelos" sem que ele volte a ser recriado).
  const procuracaoTitle = 'Procuração Ad Judicia et Extra';
  const hasProcuracao = await get('SELECT 1 AS x FROM document_templates WHERE title = ?', [procuracaoTitle]);
  if (!hasProcuracao) {
    const bodyHtml = fs.readFileSync(path.join(__dirname, 'seeds', 'procuracao-ad-judicia.html'), 'utf8');
    await run('INSERT INTO document_templates (title, category, body_html) VALUES (?, ?, ?)', [procuracaoTitle, 'Procuração', bodyHtml]);
    console.log('[setup] Modelo de documento "Procuração Ad Judicia et Extra" criado.');
  }
}

function ready() {
  if (!readyPromise) readyPromise = setup();
  return readyPromise;
}

module.exports = { pool, query: all, all, get, run, transaction, ready };
