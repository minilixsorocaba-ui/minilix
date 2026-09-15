import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurada.');

const dbConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD
    };
if (!dbConfig.connectionString && (!dbConfig.host || !dbConfig.database || !dbConfig.user || !dbConfig.password)) {
  throw new Error('Configuração do PostgreSQL não encontrada.');
}
const sslSetting = process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined;
const pool = new Pool({ ...dbConfig, ssl: sslSetting });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false }));

await pool.query(await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8'));

const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000, path: '/' };
const tokenFor = (u) => jwt.sign({ sub: u.id, role: u.role, name: u.name, email: u.email }, process.env.JWT_SECRET, { expiresIn: '8h' });

function auth(req, res, next) {
  try { req.user = jwt.verify(req.cookies.ml_session || '', process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Sessão inválida ou expirada.' }); }
}
function role(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Acesso não permitido.' }); }

app.get('/api/health', async (_req, res) => { const r = await pool.query('SELECT NOW() AS now'); res.json({ ok: true, database: true, time: r.rows[0].now }); });

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  const { rows } = await pool.query('SELECT id,name,email,password_hash,role,active FROM users WHERE email=$1', [email]);
  const u = rows[0];
  if (!u || !u.active || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  res.cookie('ml_session', tokenFor(u), cookieOptions).json({ user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

app.post('/api/auth/logout', (_req, res) => res.clearCookie('ml_session', { httpOnly: true, secure: production, sameSite: 'lax', path: '/' }).json({ ok: true }));
app.get('/api/auth/me', auth, async (req, res) => { const { rows } = await pool.query('SELECT id,name,email,role FROM users WHERE id=$1 AND active=true', [req.user.sub]); if (!rows[0]) return res.status(401).json({ error: 'Usuário não encontrado.' }); res.json({ user: rows[0] }); });

app.get('/api/dashboard', auth, async (_req, res) => {
  const [customers, openOrders, today, pending] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM customers'),
    pool.query("SELECT COUNT(*)::int AS n FROM service_orders WHERE status NOT IN ('CONCLUIDA','CANCELADA')"),
    pool.query("SELECT COUNT(*)::int AS n FROM service_orders WHERE scheduled_date=CURRENT_DATE"),
    pool.query("SELECT COUNT(*)::int AS n FROM service_orders WHERE status='PENDENTE'")
  ]);
  res.json({ customers: customers.rows[0].n, openOrders: openOrders.rows[0].n, todayOrders: today.rows[0].n, pendingOrders: pending.rows[0].n });
});

app.get('/api/containers', auth, async (_req, res) => { const { rows } = await pool.query('SELECT id,name,capacity_liters FROM containers WHERE active=true ORDER BY capacity_liters'); res.json(rows); });
app.get('/api/customers', auth, async (_req, res) => { const { rows } = await pool.query('SELECT id,name,document,phone,email FROM customers ORDER BY name'); res.json(rows); });
app.post('/api/customers', auth, role('ADMIN','ATENDIMENTO'), async (req, res) => {
  const { name, document, phone, email, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome do cliente é obrigatório.' });
  const { rows } = await pool.query('INSERT INTO customers(name,document,phone,email,notes) VALUES($1,$2,$3,$4,$5) RETURNING *', [name,document||null,phone||null,email||null,notes||null]);
  res.status(201).json(rows[0]);
});

app.post('/api/rentals', auth, role('ADMIN','ATENDIMENTO'), async (req, res) => {
  const b = req.body || {};
  if (!b.customerId || !b.scheduledDate || !b.address?.street || !b.address?.number || !b.address?.city || !b.containerId || Number(b.quantity) < 1) return res.status(400).json({ error: 'Preencha cliente, data, endereço e recipiente.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const a = await client.query('INSERT INTO addresses(customer_id,cep,street,number,complement,neighborhood,city,state,reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id', [b.customerId,b.address.cep||null,b.address.street,b.address.number,b.address.complement||null,b.address.neighborhood||null,b.address.city,b.address.state||'SP',b.address.reference||null]);
    const r = await client.query('INSERT INTO rentals(customer_id,address_id,scheduled_date,status,notes,created_by) VALUES($1,$2,$3,\'AGENDADA\',$4,$5) RETURNING id', [b.customerId,a.rows[0].id,b.scheduledDate,b.notes||null,req.user.sub]);
    await client.query('INSERT INTO rental_items(rental_id,container_id,quantity) VALUES($1,$2,$3)', [r.rows[0].id,b.containerId,Number(b.quantity)]);
    const seq = await client.query("SELECT nextval('os_number_seq') AS n");
    const year = new Date().getFullYear();
    const number = `OS-${year}-${String(seq.rows[0].n).padStart(6,'0')}`;
    const o = await client.query('INSERT INTO service_orders(number,rental_id,scheduled_date) VALUES($1,$2,$3) RETURNING *', [number,r.rows[0].id,b.scheduledDate]);
    await client.query('COMMIT');
    res.status(201).json(o.rows[0]);
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Não foi possível criar a locação.' }); }
  finally { client.release(); }
});

app.get('/api/orders', auth, async (_req, res) => {
  const { rows } = await pool.query(`SELECT o.id,o.number,o.status,o.scheduled_date,o.driver_id,c.name customer_name,c.phone,a.street,a.number,a.neighborhood,a.city,COALESCE(u.name,'Não atribuído') driver_name
    FROM service_orders o JOIN rentals r ON r.id=o.rental_id JOIN customers c ON c.id=r.customer_id JOIN addresses a ON a.id=r.address_id LEFT JOIN users u ON u.id=o.driver_id ORDER BY o.scheduled_date,o.created_at DESC`);
  res.json(rows);
});

app.get('/api/driver/orders', auth, role('ADMIN','MOTORISTA'), async (req, res) => {
  const where = req.user.role === 'MOTORISTA' ? 'AND o.driver_id=$1' : '';
  const args = req.user.role === 'MOTORISTA' ? [req.user.sub] : [];
  const { rows } = await pool.query(`SELECT o.id,o.number,o.status,o.scheduled_date,c.name customer_name,c.phone,a.street,a.number,a.neighborhood,a.city FROM service_orders o JOIN rentals r ON r.id=o.rental_id JOIN customers c ON c.id=r.customer_id JOIN addresses a ON a.id=r.address_id WHERE 1=1 ${where} ORDER BY o.scheduled_date`, args);
  res.json(rows);
});

app.patch('/api/orders/:id/status', auth, role('ADMIN','ATENDIMENTO','MOTORISTA'), async (req, res) => {
  const allowed = ['PENDENTE','ATRIBUIDA','A_CAMINHO','NO_LOCAL','CONCLUIDA','CANCELADA'];
  if (!allowed.includes(req.body?.status)) return res.status(400).json({ error: 'Status inválido.' });
  const fields = req.body.status === 'CONCLUIDA' ? 'status=$1,completed_at=NOW()' : req.body.status === 'A_CAMINHO' ? 'status=$1,started_at=COALESCE(started_at,NOW())' : 'status=$1';
  const { rows } = await pool.query(`UPDATE service_orders SET ${fields} WHERE id=$2 RETURNING *`, [req.body.status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'OS não encontrada.' });
  res.json(rows[0]);
});

app.get('/api/drivers', auth, role('ADMIN','ATENDIMENTO'), async (_req, res) => { const { rows } = await pool.query("SELECT id,name,email FROM users WHERE role='MOTORISTA' AND active=true ORDER BY name"); res.json(rows); });
app.patch('/api/orders/:id/driver', auth, role('ADMIN','ATENDIMENTO'), async (req, res) => { const { rows } = await pool.query("UPDATE service_orders SET driver_id=$1,status='ATRIBUIDA' WHERE id=$2 RETURNING *", [req.body?.driverId || null, req.params.id]); if (!rows[0]) return res.status(404).json({ error: 'OS não encontrada.' }); res.json(rows[0]); });

async function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_PASSWORD || '');
  if (!email || !password) return;

  const hash = await bcrypt.hash(password, 12);
  const existing = await pool.query('SELECT id FROM users WHERE email=$1 LIMIT 1', [email]);
  if (existing.rows[0]) {
    await pool.query('UPDATE users SET password_hash=$1, role=\'ADMIN\', active=true WHERE id=$2', [hash, existing.rows[0].id]);
    console.log('Administrador configurado/atualizado.');
    return;
  }

  await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,\'ADMIN\')', ['Administrador', email, hash]);
  console.log('Administrador inicial criado.');
}
await seedAdmin();

const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.use((req, res, next) => { if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(clientDist, 'index.html')); next(); });
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Erro interno.' }); });
app.listen(port, '0.0.0.0', () => console.log(`MiniLix API ouvindo na porta ${port}`));
