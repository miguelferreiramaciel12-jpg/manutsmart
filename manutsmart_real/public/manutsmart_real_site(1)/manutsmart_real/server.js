require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');

const { readDb, transaction, id, now } = require('./storage');
const { sendVerificationEmail, smtpIsConfigured } = require('./mailer');
const {
  ROLES,
  CATEGORIES,
  PRIORITIES,
  AREAS,
  clean,
  normalizeEmail,
  isValidEmail,
  publicUser
} = require('./validators');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'troque_esta_chave_em_producao';

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  name: 'manutsmart.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth', authLimiter);
app.use(express.static(path.join(__dirname, 'public')));

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getCurrentUser(req) {
  const db = readDb();
  const user = db.users.find((item) => item.id === req.session.userId);
  return user || null;
}

function requireAuth(req, res, next) {
  const user = getCurrentUser(req);
  if (!user) return res.status(401).json({ error: 'Você precisa estar logado.' });
  if (!user.isVerified) return res.status(403).json({ error: 'Confirme seu email antes de continuar.' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Você não tem permissão para acessar esta função.' });
    }
    next();
  };
}

function decorateRequest(request, db) {
  const employee = db.users.find((user) => user.id === request.employeeId);
  const task = db.tasks.find((item) => item.requestId === request.id) || null;
  const leader = task ? db.users.find((user) => user.id === task.leaderId) : null;
  const technician = task ? db.users.find((user) => user.id === task.technicianId) : null;
  return {
    ...request,
    employee: employee ? publicUser(employee) : null,
    leader: leader ? publicUser(leader) : null,
    technician: technician ? publicUser(technician) : null,
    task: task ? { ...task } : null
  };
}

function decorateTask(task, db) {
  const request = db.serviceRequests.find((item) => item.id === task.requestId);
  const employee = request ? db.users.find((user) => user.id === request.employeeId) : null;
  const leader = db.users.find((user) => user.id === task.leaderId);
  const technician = db.users.find((user) => user.id === task.technicianId);
  return {
    ...task,
    request: request ? { ...request } : null,
    employee: employee ? publicUser(employee) : null,
    leader: leader ? publicUser(leader) : null,
    technician: technician ? publicUser(technician) : null
  };
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: process.env.APP_NAME || 'ManutSmart',
    smtpConfigured: smtpIsConfigured()
  });
});

app.get('/api/meta', (req, res) => {
  res.json({
    roles: ROLES,
    categories: CATEGORIES,
    priorities: PRIORITIES,
    areas: AREAS,
    smtpConfigured: smtpIsConfigured()
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const name = clean(req.body.name, 120);
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const role = clean(req.body.role, 30);
    const area = clean(req.body.area, 30) || null;

    if (!name) return res.status(400).json({ error: 'Informe o nome completo.' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Informe um email válido e real.' });
    if (password.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Escolha uma função válida.' });
    if (area && !AREAS.includes(area)) return res.status(400).json({ error: 'Escolha uma área válida.' });

    const code = generateCode();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const passwordHash = await bcrypt.hash(password, 12);

    const createdUser = transaction((db) => {
      const exists = db.users.some((user) => user.email === email);
      if (exists) {
        const error = new Error('Este email já está cadastrado. Faça login ou recupere a senha.');
        error.status = 409;
        throw error;
      }

      const user = {
        id: id(),
        name,
        email,
        passwordHash,
        role,
        area,
        isVerified: false,
        verificationCodeHash: hashCode(code),
        verificationCodeExpiresAt: expiresAt,
        createdAt: now(),
        updatedAt: now()
      };
      db.users.push(user);
      return publicUser(user);
    });

    await sendVerificationEmail({ to: email, name, code });
    res.status(201).json({
      message: 'Cadastro criado. Enviamos um código para confirmar seu email.',
      user: createdUser,
      emailSent: smtpIsConfigured()
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao cadastrar usuário.' });
  }
});

app.post('/api/auth/resend-code', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Informe um email válido.' });
    const code = generateCode();
    const expiresAt = Date.now() + 15 * 60 * 1000;
    let userForEmail = null;

    transaction((db) => {
      const user = db.users.find((item) => item.email === email);
      if (!user) {
        const error = new Error('Este email ainda não está cadastrado.');
        error.status = 404;
        throw error;
      }
      if (user.isVerified) {
        const error = new Error('Este email já foi confirmado.');
        error.status = 400;
        throw error;
      }
      user.verificationCodeHash = hashCode(code);
      user.verificationCodeExpiresAt = expiresAt;
      user.updatedAt = now();
      userForEmail = { name: user.name, email: user.email };
    });

    await sendVerificationEmail({ to: userForEmail.email, name: userForEmail.name, code });
    res.json({ message: 'Enviamos um novo código de verificação.', emailSent: smtpIsConfigured() });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao reenviar código.' });
  }
});

app.post('/api/auth/verify', (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const code = clean(req.body.code, 10);
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Informe um email válido.' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Informe o código de 6 dígitos.' });

    const verifiedUser = transaction((db) => {
      const user = db.users.find((item) => item.email === email);
      if (!user) {
        const error = new Error('Conta não encontrada. Faça o cadastro primeiro.');
        error.status = 404;
        throw error;
      }
      if (user.isVerified) return publicUser(user);
      if (!user.verificationCodeHash || !user.verificationCodeExpiresAt) {
        const error = new Error('Solicite um novo código de verificação.');
        error.status = 400;
        throw error;
      }
      if (Date.now() > Number(user.verificationCodeExpiresAt)) {
        const error = new Error('Código expirado. Solicite um novo código.');
        error.status = 400;
        throw error;
      }
      if (hashCode(code) !== user.verificationCodeHash) {
        const error = new Error('Código inválido.');
        error.status = 400;
        throw error;
      }
      user.isVerified = true;
      user.verificationCodeHash = null;
      user.verificationCodeExpiresAt = null;
      user.updatedAt = now();
      return publicUser(user);
    });

    res.json({ message: 'Email confirmado com sucesso. Agora você pode entrar.', user: verifiedUser });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao confirmar email.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Informe um email válido.' });
    if (!password) return res.status(400).json({ error: 'Informe a senha.' });

    const db = readDb();
    const user = db.users.find((item) => item.email === email);
    if (!user) return res.status(401).json({ error: 'Conta não cadastrada. Faça o cadastro antes de entrar.' });
    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) return res.status(401).json({ error: 'Email ou senha incorretos.' });
    if (!user.isVerified) return res.status(403).json({ error: 'Confirme seu email antes de entrar.' });

    req.session.userId = user.id;
    res.json({ message: 'Login realizado com sucesso.', user: publicUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro ao fazer login.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('manutsmart.sid');
    res.json({ message: 'Você saiu do sistema.' });
  });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.get('/api/users/technicians', requireAuth, requireRole('lider'), (req, res) => {
  const db = readDb();
  const technicians = db.users
    .filter((user) => user.role === 'tecnico' && user.isVerified)
    .map(publicUser)
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ technicians });
});

app.post('/api/requests', requireAuth, requireRole('funcionario'), (req, res) => {
  try {
    const category = clean(req.body.category, 30);
    const priority = clean(req.body.priority, 30) || 'media';
    const title = clean(req.body.title, 140);
    const location = clean(req.body.location, 140);
    const description = clean(req.body.description, 1000);

    if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Escolha uma categoria válida.' });
    if (!PRIORITIES.includes(priority)) return res.status(400).json({ error: 'Escolha uma prioridade válida.' });
    if (!title) return res.status(400).json({ error: 'Informe o título do serviço.' });
    if (!location) return res.status(400).json({ error: 'Informe o local do serviço.' });
    if (!description) return res.status(400).json({ error: 'Descreva o serviço solicitado.' });

    const created = transaction((db) => {
      const request = {
        id: id(),
        employeeId: req.user.id,
        category,
        priority,
        title,
        location,
        description,
        status: 'aguardando_lider',
        createdAt: now(),
        updatedAt: now()
      };
      db.serviceRequests.push(request);
      return decorateRequest(request, db);
    });

    res.status(201).json({ message: 'Solicitação enviada ao líder.', request: created });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Erro ao criar solicitação.' });
  }
});

app.get('/api/requests', requireAuth, (req, res) => {
  const db = readDb();
  let requests = db.serviceRequests;

  if (req.user.role === 'funcionario') {
    requests = requests.filter((request) => request.employeeId === req.user.id);
  }

  if (req.user.role === 'tecnico') {
    const taskRequestIds = new Set(db.tasks
      .filter((task) => task.technicianId === req.user.id)
      .map((task) => task.requestId));
    requests = requests.filter((request) => taskRequestIds.has(request.id));
  }

  const decorated = requests
    .map((request) => decorateRequest(request, db))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ requests: decorated });
});

app.post('/api/requests/:id/assign', requireAuth, requireRole('lider'), (req, res) => {
  try {
    const requestId = req.params.id;
    const technicianId = clean(req.body.technicianId, 80);
    const leaderNote = clean(req.body.leaderNote, 1000);

    const assigned = transaction((db) => {
      const request = db.serviceRequests.find((item) => item.id === requestId);
      if (!request) {
        const error = new Error('Solicitação não encontrada.');
        error.status = 404;
        throw error;
      }
      if (request.status !== 'aguardando_lider') {
        const error = new Error('Esta solicitação já foi encaminhada ou finalizada.');
        error.status = 400;
        throw error;
      }
      const technician = db.users.find((user) => user.id === technicianId && user.role === 'tecnico' && user.isVerified);
      if (!technician) {
        const error = new Error('Selecione um técnico cadastrado e com email confirmado.');
        error.status = 400;
        throw error;
      }
      const task = {
        id: id(),
        requestId: request.id,
        leaderId: req.user.id,
        technicianId: technician.id,
        status: 'enviada_para_tecnico',
        leaderNote,
        technicianNote: '',
        createdAt: now(),
        updatedAt: now(),
        startedAt: null,
        finishedAt: null
      };
      request.status = 'encaminhada_para_tecnico';
      request.updatedAt = now();
      db.tasks.push(task);
      return decorateTask(task, db);
    });

    res.status(201).json({ message: 'Serviço encaminhado para o técnico.', task: assigned });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao encaminhar solicitação.' });
  }
});

app.get('/api/tasks', requireAuth, (req, res) => {
  const db = readDb();
  let tasks = db.tasks;

  if (req.user.role === 'tecnico') {
    tasks = tasks.filter((task) => task.technicianId === req.user.id);
  } else if (req.user.role === 'lider') {
    tasks = tasks.filter((task) => task.leaderId === req.user.id);
  } else if (req.user.role === 'funcionario') {
    const ownRequestIds = new Set(db.serviceRequests
      .filter((request) => request.employeeId === req.user.id)
      .map((request) => request.id));
    tasks = tasks.filter((task) => ownRequestIds.has(task.requestId));
  }

  const decorated = tasks
    .map((task) => decorateTask(task, db))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ tasks: decorated });
});

app.patch('/api/tasks/:id/status', requireAuth, requireRole('tecnico'), (req, res) => {
  try {
    const taskId = req.params.id;
    const status = clean(req.body.status, 50);
    const technicianNote = clean(req.body.technicianNote, 1000);
    const allowedStatuses = ['em_andamento', 'concluida'];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ error: 'Escolha um status válido.' });
    }

    const updated = transaction((db) => {
      const task = db.tasks.find((item) => item.id === taskId);
      if (!task) {
        const error = new Error('Tarefa não encontrada.');
        error.status = 404;
        throw error;
      }
      if (task.technicianId !== req.user.id) {
        const error = new Error('Esta tarefa não foi encaminhada para você.');
        error.status = 403;
        throw error;
      }
      const request = db.serviceRequests.find((item) => item.id === task.requestId);
      task.status = status;
      task.technicianNote = technicianNote;
      task.updatedAt = now();
      if (status === 'em_andamento' && !task.startedAt) task.startedAt = now();
      if (status === 'concluida') {
        task.finishedAt = now();
        if (request) request.status = 'concluida';
      } else if (request) {
        request.status = 'em_execucao';
      }
      if (request) request.updatedAt = now();
      return decorateTask(task, db);
    });

    res.json({ message: 'Status atualizado.', task: updated });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Erro ao atualizar status.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n${process.env.APP_NAME || 'ManutSmart'} rodando em http://localhost:${PORT}`);
  console.log(smtpIsConfigured()
    ? 'SMTP configurado: os códigos serão enviados por email.'
    : 'SMTP não configurado: os códigos aparecerão no terminal em modo desenvolvimento.');
});
