const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou senha invalidos.' });
  }
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Criacao de novos usuarios da equipe - somente admin
router.post('/users', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem criar usuarios.' });
  }
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha sao obrigatorios.' });
  }
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db.prepare(
      'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    ).run(name, email.toLowerCase().trim(), hash, role || 'advogado');
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: 'Nao foi possivel criar o usuario (e-mail ja cadastrado?).' });
  }
});

router.get('/users', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY name').all();
  res.json(users);
});

router.delete('/users/:id', requireAuth, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem remover usuarios.' });
  }
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Você não pode remover seu próprio usuário.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

module.exports = router;
