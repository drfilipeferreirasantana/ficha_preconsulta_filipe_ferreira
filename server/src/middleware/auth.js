const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-troque-em-producao';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Nao autenticado.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessao invalida ou expirada.' });
  }
}

// Igual a requireAuth, mas tambem aceita o token via ?token=... na URL.
// Uso restrito a rotas que precisam ser abertas em nova aba pelo navegador
// (ex: recibo em PDF/HTML), onde nao e possivel enviar o header Authorization.
function requireAuthFlexible(req, res, next) {
  const header = req.headers.authorization || '';
  const token = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.query.token;
  if (!token) return res.status(401).json({ error: 'Nao autenticado.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessao invalida ou expirada.' });
  }
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = { requireAuth, requireAuthFlexible, signToken, JWT_SECRET };
