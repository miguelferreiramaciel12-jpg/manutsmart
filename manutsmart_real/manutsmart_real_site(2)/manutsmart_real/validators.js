const ROLES = ['funcionario', 'lider', 'tecnico'];
const CATEGORIES = ['eletrica', 'hidraulica', 'alvenaria', 'jardinagem'];
const PRIORITIES = ['baixa', 'media', 'alta', 'urgente'];
const AREAS = ['eletrica', 'hidraulica', 'alvenaria', 'jardinagem', 'coordenacao', 'administrativo'];

const BLOCKED_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'teste.com',
  'test.com',
  'fake.com',
  'mailinator.com',
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com'
]);

function clean(value, max = 255) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeEmail(email) {
  return clean(email, 254).toLowerCase();
}

function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  // Validação prática de formato. A confirmação real é feita pelo código enviado ao email.
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!regex.test(normalized)) return false;
  const domain = normalized.split('@').pop();
  if (!domain || BLOCKED_DOMAINS.has(domain)) return false;
  if (domain.includes('..')) return false;
  return true;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    area: user.area,
    isVerified: Boolean(user.isVerified),
    createdAt: user.createdAt
  };
}

function labelRole(role) {
  return {
    funcionario: 'Funcionário',
    lider: 'Líder',
    tecnico: 'Técnico'
  }[role] || role;
}

function labelCategory(category) {
  return {
    eletrica: 'Elétrica',
    hidraulica: 'Hidráulica',
    alvenaria: 'Alvenaria',
    jardinagem: 'Jardinagem'
  }[category] || category;
}

module.exports = {
  ROLES,
  CATEGORIES,
  PRIORITIES,
  AREAS,
  clean,
  normalizeEmail,
  isValidEmail,
  publicUser,
  labelRole,
  labelCategory
};
