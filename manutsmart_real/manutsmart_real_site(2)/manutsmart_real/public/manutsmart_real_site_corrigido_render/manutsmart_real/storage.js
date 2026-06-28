const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'database.json');

function initialState() {
  return {
    users: [],
    serviceRequests: [],
    tasks: []
  };
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(initialState(), null, 2));
  }
}

function readDb() {
  ensureDatabase();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    const data = JSON.parse(raw);
    return {
      users: Array.isArray(data.users) ? data.users : [],
      serviceRequests: Array.isArray(data.serviceRequests) ? data.serviceRequests : [],
      tasks: Array.isArray(data.tasks) ? data.tasks : []
    };
  } catch (error) {
    throw new Error('Banco de dados local corrompido. Verifique data/database.json.');
  }
}

function writeDb(data) {
  ensureDatabase();
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

function transaction(mutator) {
  const data = readDb();
  const result = mutator(data);
  writeDb(data);
  return result;
}

function id() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

module.exports = {
  readDb,
  writeDb,
  transaction,
  id,
  now
};
