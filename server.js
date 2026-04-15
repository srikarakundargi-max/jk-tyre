/**
 * JK Tyre Delivery Management Platform — ALL-IN-ONE server.js
 * Replace your existing server.js with this file entirely.
 * No separate route files needed.
 */
'use strict';

const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════════════════════
// DATABASE — safe setup, never crashes the server
// ══════════════════════════════════════════════════════════════
let db          = null;
let dbConnected = false;
let dbError     = 'DATABASE_URL not set — add it in Railway web service → Variables tab';

function setupDB() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('❌ DATABASE_URL not set'); return; }

  db = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },   // required for Railway
    max: 10,
    connectionTimeoutMillis: 8000,
  });

  db.on('error', err => console.error('DB pool error:', err.message));

  db.query('SELECT NOW()', (err, res) => {
    if (err) { dbError = err.message; console.error('❌ DB failed:', err.message); }
    else     { dbConnected = true; dbError = null; console.log('✅ PostgreSQL connected:', res.rows[0].now); createTables(); }
  });
}

async function createTables() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY, date TEXT, func TEXT, reporter TEXT, description TEXT,
      location TEXT, channel TEXT, priority TEXT DEFAULT 'MEDIUM',
      rca_done BOOLEAN DEFAULT false, root_cause TEXT DEFAULT '',
      action TEXT DEFAULT '', assignee TEXT DEFAULT '', target TEXT DEFAULT '',
      status TEXT DEFAULT 'Open', progress INTEGER DEFAULT 0,
      impact TEXT DEFAULT '', resources TEXT DEFAULT '',
      qip TEXT DEFAULT '', business_impact TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS dept_kpis (
      id SERIAL PRIMARY KEY, dept_key TEXT NOT NULL, name TEXT,
      unit TEXT DEFAULT '', target TEXT DEFAULT '', actual TEXT DEFAULT '',
      prev TEXT DEFAULT '', owner TEXT DEFAULT '', freq TEXT DEFAULT 'Monthly',
      remarks TEXT DEFAULT '', higher BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0, updated_at TIMESTAMP DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS idx_dept_kpis_dept ON dept_kpis(dept_key)`,
    `CREATE TABLE IF NOT EXISTS kpi_scorecard (
      id SERIAL PRIMARY KEY, kpi TEXT UNIQUE,
      baseline FLOAT, current_val FLOAT, target FLOAT, gap FLOAT, pct FLOAT,
      status TEXT, trend TEXT, lower_is_better BOOLEAN DEFAULT false,
      owner TEXT, action TEXT, updated_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS cfm_reviews (
      id SERIAL PRIMARY KEY, council TEXT DEFAULT 'Delivery Management',
      period TEXT DEFAULT '2026-01',
      kpi_data JSONB DEFAULT '[]', mom_data JSONB DEFAULT '[]',
      actions_data JSONB DEFAULT '[]', achievements JSONB DEFAULT '[]',
      priorities JSONB DEFAULT '[]', updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(council, period))`,
    `CREATE TABLE IF NOT EXISTS settings_store (
      key TEXT PRIMARY KEY, data JSONB DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS uploaded_files (
      id SERIAL PRIMARY KEY, file_id TEXT UNIQUE,
      original_name TEXT, stored_name TEXT, mimetype TEXT,
      size INTEGER, category TEXT DEFAULT 'General',
      uploaded_at TIMESTAMP DEFAULT NOW())`
  ];
  for (const s of stmts) {
    try { await db.query(s); } catch (e) { if (!e.message.includes('already exists')) console.error('Schema err:', e.message); }
  }
  console.log('✅ All tables created/verified');
}

// Safe query helper
async function q(sql, params) {
  if (!dbConnected) throw new Error(dbError || 'Database not connected');
  return db.query(sql, params);
}

// ══════════════════════════════════════════════════════════════
// MIDDLEWARE
// ══════════════════════════════════════════════════════════════
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════════════════════════
// DIAGNOSTIC ROUTES
// ══════════════════════════════════════════════════════════════
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date() }));

app.get('/api/db-status', async (_req, res) => {
  const url = process.env.DATABASE_URL;
  const info = {
    server_running: true,
    DATABASE_URL_set: !!url,
    DATABASE_URL_preview: url ? url.replace(/:([^:@]+)@/, ':***@') : 'NOT SET',
    db_connected: dbConnected,
    db_error: dbError,
    tables: []
  };
  if (dbConnected) {
    try {
      const t = await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
      info.tables = t.rows.map(r => r.tablename);
    } catch (e) { info.db_error = e.message; }
  }
  res.json(info);
});

// ══════════════════════════════════════════════════════════════
// ISSUES API
// ══════════════════════════════════════════════════════════════
app.get('/api/issues', async (_req, res) => {
  try { res.json((await q('SELECT * FROM issues ORDER BY created_at DESC')).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/issues', async (req, res) => {
  const b = req.body;
  try {
    const r = await q(
      `INSERT INTO issues (id,date,func,reporter,description,location,channel,priority,
        rca_done,root_cause,action,assignee,target,status,progress,impact,resources,qip,business_impact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, progress=EXCLUDED.progress,
         action=EXCLUDED.action, assignee=EXCLUDED.assignee, root_cause=EXCLUDED.root_cause,
         rca_done=EXCLUDED.rca_done, updated_at=NOW() RETURNING *`,
      [b.id, b.date, b.func, b.reporter, b.description||b.desc, b.location, b.channel,
       b.priority||'MEDIUM', b.rca_done||false, b.root_cause||'', b.action||'',
       b.assignee||'', b.target||'', b.status||'Open', b.progress||0,
       b.impact||'', b.resources||'', b.qip||'', b.business_impact||'']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/issues/:id', async (req, res) => {
  const b = req.body;
  try {
    const r = await q(
      `UPDATE issues SET date=$1,func=$2,reporter=$3,description=$4,location=$5,channel=$6,
        priority=$7,rca_done=$8,root_cause=$9,action=$10,assignee=$11,target=$12,status=$13,
        progress=$14,impact=$15,resources=$16,qip=$17,business_impact=$18,updated_at=NOW()
       WHERE id=$19 RETURNING *`,
      [b.date,b.func,b.reporter,b.description||b.desc,b.location,b.channel,b.priority,
       b.rca_done,b.root_cause,b.action,b.assignee,b.target,b.status,b.progress,
       b.impact,b.resources,b.qip,b.business_impact,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/issues/:id', async (req, res) => {
  const f = req.body;
  const m = { rcaDone:'rca_done', rootCause:'root_cause', businessImpact:'business_impact', desc:'description' };
  const keys = Object.keys(f);
  if (!keys.length) return res.status(400).json({ error: 'No fields' });
  const sets = keys.map((k,i) => `${m[k]||k}=$${i+1}`);
  const vals = [...keys.map(k => f[k]), req.params.id];
  try {
    const r = await q(`UPDATE issues SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/issues/:id', async (req, res) => {
  try { await q('DELETE FROM issues WHERE id=$1', [req.params.id]); res.json({ success: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// KPIs API
// ══════════════════════════════════════════════════════════════
app.get('/api/kpis/scorecard', async (_req, res) => {
  try { res.json((await q('SELECT * FROM kpi_scorecard ORDER BY id')).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/kpis/scorecard', async (req, res) => {
  try {
    for (const r of req.body) {
      await q(
        `INSERT INTO kpi_scorecard (kpi,baseline,current_val,target,gap,pct,status,trend,lower_is_better,owner,action)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (kpi) DO UPDATE SET baseline=$2,current_val=$3,target=$4,gap=$5,
           pct=$6,status=$7,trend=$8,lower_is_better=$9,owner=$10,action=$11,updated_at=NOW()`,
        [r.kpi,r.baseline,r.current??r.current_val,r.target,r.gap,r.pct,r.status,r.trend,r.lower??false,r.owner,r.action]
      );
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/kpis/dept/:dept', async (req, res) => {
  try { res.json((await q('SELECT * FROM dept_kpis WHERE dept_key=$1 ORDER BY sort_order,id', [req.params.dept])).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/kpis/dept/:dept', async (req, res) => {
  const dept = req.params.dept;
  const rows = req.body;
  if (!dbConnected) return res.status(503).json({ error: dbError });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dept_kpis WHERE dept_key=$1', [dept]);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO dept_kpis (dept_key,name,unit,target,actual,prev,owner,freq,remarks,higher,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [dept,r.name,r.unit||'',String(r.target||''),String(r.actual||''),String(r.prev||''),
         r.owner||'',r.freq||'Monthly',r.remarks||'',r.higher!==false,i]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, count: rows.length });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════
// CFM API
// ══════════════════════════════════════════════════════════════
app.get('/api/cfm', async (req, res) => {
  const { council='Delivery Management', period } = req.query;
  try {
    let sql = 'SELECT * FROM cfm_reviews WHERE council=$1';
    const p = [council];
    if (period) { sql += ' AND period=$2'; p.push(period); }
    sql += ' ORDER BY updated_at DESC LIMIT 1';
    res.json((await q(sql, p)).rows[0] || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/cfm', async (req, res) => {
  const { council='Delivery Management', period='2026-01',
    kpi_data=[], mom_data=[], actions_data=[], achievements=[], priorities=[] } = req.body;
  try {
    const r = await q(
      `INSERT INTO cfm_reviews (council,period,kpi_data,mom_data,actions_data,achievements,priorities)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (council,period) DO UPDATE SET
         kpi_data=$3,mom_data=$4,actions_data=$5,achievements=$6,priorities=$7,updated_at=NOW()
       RETURNING *`,
      [council,period,JSON.stringify(kpi_data),JSON.stringify(mom_data),
       JSON.stringify(actions_data),JSON.stringify(achievements),JSON.stringify(priorities)]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// SETTINGS API (tube-flap, oe-config, etc.)
// ══════════════════════════════════════════════════════════════
app.get('/api/settings/:key', async (req, res) => {
  try { res.json(((await q('SELECT data FROM settings_store WHERE key=$1', [req.params.key])).rows[0]?.data) || {}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/:key', async (req, res) => {
  try {
    await q(`INSERT INTO settings_store (key,data) VALUES ($1,$2)
             ON CONFLICT (key) DO UPDATE SET data=$2,updated_at=NOW()`,
      [req.params.key, JSON.stringify(req.body)]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

let upload = null;
try {
  const multer = require('multer');
  upload = multer({
    storage: multer.diskStorage({
      destination: (_r, _f, cb) => cb(null, uploadDir),
      filename: (_r, f, cb) => cb(null, Date.now() + '_' + f.originalname.replace(/[^a-zA-Z0-9._-]/g,'_'))
    }),
    limits: { fileSize: 50 * 1024 * 1024 }
  });
} catch (e) { console.warn('multer not available'); }

app.post('/api/upload', (req, res, next) => {
  if (!upload) return res.status(503).json({ error: 'Uploads not available' });
  upload.array('files', 20)(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });
    try {
      const saved = [];
      for (const f of req.files) {
        const fid = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2,5);
        await q(`INSERT INTO uploaded_files (file_id,original_name,stored_name,mimetype,size,category) VALUES ($1,$2,$3,$4,$5,$6)`,
          [fid, f.originalname, f.filename, f.mimetype, f.size, req.body.category||'General']);
        saved.push({ id: fid, name: f.originalname, size: f.size });
      }
      res.json({ success: true, files: saved });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
});

app.get('/api/files', async (_req, res) => {
  try { res.json((await q('SELECT * FROM uploaded_files ORDER BY uploaded_at DESC')).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// CATCH-ALL (must be last)
// ══════════════════════════════════════════════════════════════
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ══════════════════════════════════════════════════════════════
// START — server always starts; DB connects after
// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('\n🚀 JK Tyre server running on port', PORT);
  console.log('   DATABASE_URL:', process.env.DATABASE_URL ? 'SET ✅' : 'MISSING ❌');
  console.log('   Diagnose at: /db-check.html\n');
});

setupDB();
