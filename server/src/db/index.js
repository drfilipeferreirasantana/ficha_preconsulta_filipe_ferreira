const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'ffa.sqlite');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Migracao leve e idempotente: adiciona colunas novas em bancos ja existentes
// (CREATE TABLE IF NOT EXISTS acima nao altera tabelas que ja existem).
function ensureColumns(table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, definition] of Object.entries(columns)) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  }
}
ensureColumns('processes', {
  case_value: 'REAL',
  fee_type: 'TEXT',
  fee_percentage: 'REAL',
  down_payment: 'REAL'
});
ensureColumns('tasks', {
  is_hearing: 'INTEGER NOT NULL DEFAULT 0',
  event_start: 'TEXT',
  event_end: 'TEXT',
  notify_client: 'INTEGER NOT NULL DEFAULT 0',
  google_event_id: 'TEXT',
  google_event_link: 'TEXT'
});

// Cria o usuario administrador no primeiro start, se ainda nao houver nenhum usuario
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const name = process.env.ADMIN_NAME || 'Administrador';
  const email = process.env.ADMIN_EMAIL || 'admin@escritorio.com';
  const password = process.env.ADMIN_PASSWORD || 'mudar123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, hash, 'admin');
  console.log(`[setup] Usuario admin criado: ${email} (troque a senha padrao assim que possivel)`);
}

module.exports = db;
