'use strict';
const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const { Pool } = require('pg');

const app  = express();
const PORT = process.env.PORT || 3000;

// ══════════════════════════════════════════════════════════════
// DATABASE
// ══════════════════════════════════════════════════════════════
let db = null, dbConnected = false, dbError = 'DATABASE_URL not set';

function setupDB() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('❌ DATABASE_URL not set'); return; }
  db = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 10, connectionTimeoutMillis: 8000 });
  db.on('error', err => console.error('DB pool error:', err.message));
  db.query('SELECT NOW()', (err, res) => {
    if (err) { dbError = err.message; console.error('❌ DB failed:', err.message); }
    else { dbConnected = true; dbError = null; console.log('✅ PostgreSQL connected:', res.rows[0].now); createTables(); }
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
    `CREATE TABLE IF NOT EXISTS qips (
      id TEXT PRIMARY KEY, title TEXT, phase TEXT, owner TEXT,
      target TEXT, status TEXT DEFAULT 'In Progress', progress INTEGER DEFAULT 0,
      channel TEXT, priority TEXT DEFAULT 'HIGH', objective TEXT DEFAULT '',
      expected_outcome TEXT DEFAULT '', issues JSONB DEFAULT '[]',
      updated_at TIMESTAMP DEFAULT NOW())`,
    `CREATE TABLE IF NOT EXISTS dept_kpis (
      id SERIAL PRIMARY KEY, dept_key TEXT NOT NULL, name TEXT,
      unit TEXT DEFAULT '', target TEXT DEFAULT '', actual TEXT DEFAULT '',
      prev TEXT DEFAULT '', owner TEXT DEFAULT '', freq TEXT DEFAULT 'Monthly',
      remarks TEXT DEFAULT '', higher BOOLEAN DEFAULT true,
      sort_order INTEGER DEFAULT 0, updated_at TIMESTAMP DEFAULT NOW())`,
    `CREATE INDEX IF NOT EXISTS idx_dept_kpis_dept ON dept_kpis(dept_key)`,
    `CREATE TABLE IF NOT EXISTS kpi_data (
      id TEXT PRIMARY KEY, data JSONB DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT NOW())`,
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
    try { await db.query(s); }
    catch (e) { if (!e.message.includes('already exists')) console.error('Schema err:', e.message); }
  }
  console.log('✅ All tables ready');
}

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
// DIAGNOSTICS
// ══════════════════════════════════════════════════════════════
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date() }));

app.get('/api/db-status', async (_req, res) => {
  const url = process.env.DATABASE_URL;
  const info = { server_running: true, DATABASE_URL_set: !!url,
    DATABASE_URL_preview: url ? url.replace(/:([^:@]+)@/, ':***@') : 'NOT SET',
    db_connected: dbConnected, db_error: dbError, tables: [] };
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

// Bulk seed — ON CONFLICT DO NOTHING (never overwrites user edits)
app.post('/api/issues/bulk-seed', async (req, res) => {
  const issues = req.body;
  if (!Array.isArray(issues)) return res.status(400).json({ error: 'Array required' });
  let seeded = 0;
  for (const b of issues) {
    try {
      const r = await q(
        `INSERT INTO issues (id,date,func,reporter,description,location,channel,priority,
          rca_done,root_cause,action,assignee,target,status,progress,impact,resources,qip,business_impact)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         ON CONFLICT (id) DO NOTHING`,
        [b.id,b.date,b.func,b.reporter,b.description||b.desc,b.location,b.channel,
         b.priority||'MEDIUM',b.rca_done||false,b.root_cause||'',b.action||'',
         b.assignee||'',b.target||'',b.status||'Open',b.progress||0,
         b.impact||'',b.resources||'',b.qip||'',b.business_impact||'']
      );
      if (r.rowCount > 0) seeded++;
    } catch (e) { /* skip individual errors */ }
  }
  res.json({ success: true, seeded, total: issues.length });
});

app.post('/api/issues', async (req, res) => {
  const b = req.body;
  try {
    const r = await q(
      `INSERT INTO issues (id,date,func,reporter,description,location,channel,priority,
        rca_done,root_cause,action,assignee,target,status,progress,impact,resources,qip,business_impact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO NOTHING RETURNING *`,
      [b.id,b.date,b.func,b.reporter,b.description||b.desc,b.location,b.channel,
       b.priority||'MEDIUM',b.rca_done||false,b.root_cause||'',b.action||'',
       b.assignee||'',b.target||'',b.status||'Open',b.progress||0,
       b.impact||'',b.resources||'',b.qip||'',b.business_impact||'']
    );
    res.status(201).json(r.rows[0] || { id: b.id, note: 'already exists' });
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
// QIPs API
// ══════════════════════════════════════════════════════════════
app.get('/api/qips', async (_req, res) => {
  try { res.json((await q('SELECT * FROM qips ORDER BY id')).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/qips/bulk-seed', async (req, res) => {
  const qips = req.body;
  if (!Array.isArray(qips)) return res.status(400).json({ error: 'Array required' });
  let seeded = 0;
  for (const b of qips) {
    try {
      const r = await q(
        `INSERT INTO qips (id,title,phase,owner,target,status,progress,channel,priority,objective,expected_outcome,issues)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO NOTHING`,
        [b.id,b.title,b.phase,b.owner,b.target,b.status||'In Progress',b.progress||0,
         b.channel,b.priority||'HIGH',b.objective||'',b.expectedOutcome||'',JSON.stringify(b.issues||[])]
      );
      if (r.rowCount > 0) seeded++;
    } catch (e) { /* skip */ }
  }
  res.json({ success: true, seeded, total: qips.length });
});

app.patch('/api/qips/:id', async (req, res) => {
  const { status, progress, phase, owner, target } = req.body;
  const sets = [], vals = [];
  if (status   !== undefined) { sets.push(`status=$${sets.length+1}`);   vals.push(status); }
  if (progress !== undefined) { sets.push(`progress=$${sets.length+1}`); vals.push(progress); }
  if (phase    !== undefined) { sets.push(`phase=$${sets.length+1}`);    vals.push(phase); }
  if (owner    !== undefined) { sets.push(`owner=$${sets.length+1}`);    vals.push(owner); }
  if (target   !== undefined) { sets.push(`target=$${sets.length+1}`);   vals.push(target); }
  if (!sets.length) return res.status(400).json({ error: 'No fields' });
  vals.push(req.params.id);
  try {
    const r = await q(`UPDATE qips SET ${sets.join(',')},updated_at=NOW() WHERE id=$${vals.length} RETURNING *`, vals);
    res.json(r.rows[0] || { error: 'Not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// KPI DATA (scorecard, lag, lead — stored as named JSON blobs)
// ══════════════════════════════════════════════════════════════
app.get('/api/kpi-data/:key', async (req, res) => {
  try {
    const r = await q('SELECT data FROM kpi_data WHERE id=$1', [req.params.key]);
    res.json(r.rows[0]?.data || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/kpi-data/:key', async (req, res) => {
  try {
    await q(`INSERT INTO kpi_data (id,data) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET data=$2,updated_at=NOW()`,
      [req.params.key, JSON.stringify(req.body)]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// KPIs DEPT
// ══════════════════════════════════════════════════════════════
app.get('/api/kpis/dept/:dept', async (req, res) => {
  try { res.json((await q('SELECT * FROM dept_kpis WHERE dept_key=$1 ORDER BY sort_order,id', [req.params.dept])).rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/kpis/dept/:dept', async (req, res) => {
  const dept = req.params.dept;
  if (!dbConnected) return res.status(503).json({ error: dbError });
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dept_kpis WHERE dept_key=$1', [dept]);
    for (let i = 0; i < req.body.length; i++) {
      const r = req.body[i];
      await client.query(
        `INSERT INTO dept_kpis (dept_key,name,unit,target,actual,prev,owner,freq,remarks,higher,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [dept,r.name,r.unit||'',String(r.target||''),String(r.actual||''),String(r.prev||''),
         r.owner||'',r.freq||'Monthly',r.remarks||'',r.higher!==false,i]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, count: req.body.length });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ══════════════════════════════════════════════════════════════
// CFM
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
         kpi_data=$3,mom_data=$4,actions_data=$5,achievements=$6,priorities=$7,updated_at=NOW() RETURNING *`,
      [council,period,JSON.stringify(kpi_data),JSON.stringify(mom_data),
       JSON.stringify(actions_data),JSON.stringify(achievements),JSON.stringify(priorities)]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════
app.get('/api/settings/:key', async (req, res) => {
  try { res.json(((await q('SELECT data FROM settings_store WHERE key=$1', [req.params.key])).rows[0]?.data) || {}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings/:key', async (req, res) => {
  try {
    await q(`INSERT INTO settings_store (key,data) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET data=$2,updated_at=NOW()`,
      [req.params.key, JSON.stringify(req.body)]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ══════════════════════════════════════════════════════════════
// FILE UPLOAD + PARSING
// ══════════════════════════════════════════════════════════════
let XLSX = null;
try { XLSX = require('xlsx'); console.log('✅ xlsx parser ready'); } catch(e) { console.warn('xlsx not available'); }

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Parse an uploaded file into rows of objects ──────────────
function parseFile(filePath, originalName) {
  if (!XLSX) return null;
  try {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows  = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    return rows;
  } catch(e) {
    console.warn('Parse error for', originalName, ':', e.message);
    return null;
  }
}

// ── Normalise a header key for loose matching ─────────────────
function norm(s) { return String(s||'').toLowerCase().replace(/[\s_\-\/()%#]/g,''); }

// ── Map parsed rows → KPI records ────────────────────────────
async function ingestKPIData(rows) {
  let updated = 0;
  for (const row of rows) {
    const keys = Object.keys(row);
    const get  = (...candidates) => {
      const k = keys.find(k => candidates.some(c => norm(k).includes(norm(c))));
      return k ? String(row[k]||'').trim() : '';
    };

    const kpi     = get('kpi','name','indicator','metric');
    const actual  = get('actual','current','value','result','achieved');
    const target  = get('target','goal','benchmark');
    const baseline= get('baseline','base','previous');
    const owner   = get('owner','responsible','person');
    const status  = get('status','health','rag');
    const trend   = get('trend','direction','change');
    const action  = get('action','comment','remark','note');

    if (!kpi || !actual) continue;

    try {
      await q(
        `INSERT INTO kpi_scorecard (kpi, current_val, target, baseline, status, trend, owner, action)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (kpi) DO UPDATE SET
           current_val = EXCLUDED.current_val,
           target      = COALESCE(NULLIF(EXCLUDED.target,'')::float, kpi_scorecard.target),
           baseline    = COALESCE(NULLIF(EXCLUDED.baseline,'')::float, kpi_scorecard.baseline),
           status      = COALESCE(NULLIF(EXCLUDED.status,''), kpi_scorecard.status),
           trend       = COALESCE(NULLIF(EXCLUDED.trend,''), kpi_scorecard.trend),
           owner       = COALESCE(NULLIF(EXCLUDED.owner,''), kpi_scorecard.owner),
           action      = COALESCE(NULLIF(EXCLUDED.action,''), kpi_scorecard.action),
           updated_at  = NOW()`,
        [kpi,
         parseFloat(actual)||null,
         parseFloat(target)||null,
         parseFloat(baseline)||null,
         status||null, trend||null, owner||null, action||null]
      );
      updated++;
    } catch(e) { console.warn('KPI upsert error:', e.message); }
  }
  return updated;
}

// ── Map parsed rows → Issues ──────────────────────────────────
async function ingestIssues(rows) {
  let added = 0;
  // Get current max ID so new IDs don't clash
  const maxRes = await q("SELECT id FROM issues ORDER BY id DESC").catch(() => ({rows:[]}));
  let maxNum = maxRes.rows.reduce((mx, r) => { const n = parseInt(r.id.replace('DM-',''))||0; return n>mx?n:mx; }, 0);

  for (const row of rows) {
    const keys = Object.keys(row);
    const get  = (...c) => { const k = keys.find(k => c.some(x => norm(k).includes(norm(x)))); return k ? String(row[k]||'').trim() : ''; };

    const desc = get('description','issue','problem','desc','title','subject');
    if (!desc || desc.length < 3) continue;

    // Re-use existing ID or generate new one
    let id = get('id','issueid','no','number','sr');
    if (!id || id.length < 3) { maxNum++; id = 'DM-' + String(maxNum).padStart(3,'0'); }

    try {
      await q(
        `INSERT INTO issues (id,date,func,reporter,description,location,channel,priority,status,progress,impact,resources,business_impact)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO NOTHING`,
        [id,
         get('date','logged','reported') || new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}),
         get('function','func','dept','department','area') || 'General',
         get('reporter','raised','reported by','raisedby') || 'Upload',
         desc,
         get('location','plant','site') || '',
         get('channel','market','segment') || 'Replacement',
         (get('priority','urgency','severity')||'MEDIUM').toUpperCase(),
         get('status','state') || 'Open',
         parseInt(get('progress','completion','%'))||0,
         get('impact','effect','consequence') || '',
         get('resources','resource','team') || '',
         get('businessimpact','financial','monetaryimpact','₹') || ''
        ]
      );
      added++;
    } catch(e) { /* skip duplicates */ }
  }
  return added;
}

// ── Map parsed rows → QIPs ────────────────────────────────────
async function ingestQIPs(rows) {
  let added = 0;
  for (const row of rows) {
    const keys = Object.keys(row);
    const get  = (...c) => { const k = keys.find(k => c.some(x => norm(k).includes(norm(x)))); return k ? String(row[k]||'').trim() : ''; };
    const title = get('title','qip','project','name','description');
    if (!title || title.length < 3) continue;
    let id = get('id','qipid','no');
    if (!id) { id = 'QIP-U' + Date.now().toString(36).slice(-4).toUpperCase(); }
    try {
      await q(
        `INSERT INTO qips (id,title,phase,owner,target,status,progress,channel,priority,objective)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           title=EXCLUDED.title, phase=COALESCE(NULLIF(EXCLUDED.phase,''),qips.phase),
           progress=CASE WHEN EXCLUDED.progress>0 THEN EXCLUDED.progress ELSE qips.progress END,
           status=COALESCE(NULLIF(EXCLUDED.status,''),qips.status), updated_at=NOW()`,
        [id, title,
         get('phase','stage','dmaic') || 'Define',
         get('owner','lead','responsible') || '',
         get('target','date','deadline') || '',
         get('status','state') || 'In Progress',
         parseInt(get('progress','completion','%'))||0,
         get('channel','market') || 'All',
         (get('priority','urgency')||'HIGH').toUpperCase(),
         get('objective','goal','aim') || ''
        ]
      );
      added++;
    } catch(e) {}
  }
  return added;
}

// ── /api/upload/analyse — parse files already stored on disk ──
app.post('/api/upload/analyse', async (req, res) => {
  if (!dbConnected) return res.status(503).json({ error: 'Database not connected' });
  const { fileIds, modules } = req.body; // fileIds from DB, modules = ['kpi','issues','qips']
  if (!fileIds?.length) return res.status(400).json({ error: 'No file IDs provided' });

  const result = { kpi: 0, issues: 0, qips: 0, errors: [] };

  try {
    // Load file records from DB
    const placeholders = fileIds.map((_,i) => `$${i+1}`).join(',');
    const fileRows = (await q(`SELECT * FROM uploaded_files WHERE file_id IN (${placeholders})`, fileIds)).rows;

    for (const fileRec of fileRows) {
      const filePath = path.join(uploadDir, fileRec.stored_name);
      if (!fs.existsSync(filePath)) {
        result.errors.push(fileRec.original_name + ': file not found on disk');
        continue;
      }

      const ext = path.extname(fileRec.original_name).toLowerCase();
      const cat = fileRec.category;

      // Only parse xlsx, xls, csv, json
      if (!['.xlsx','.xls','.csv','.json'].includes(ext)) continue;

      let rows = [];
      if (ext === '.json') {
        try { const raw = JSON.parse(fs.readFileSync(filePath,'utf8')); rows = Array.isArray(raw) ? raw : [raw]; }
        catch(e) { result.errors.push(fileRec.original_name + ': invalid JSON'); continue; }
      } else {
        rows = parseFile(filePath, fileRec.original_name) || [];
      }

      if (!rows.length) { result.errors.push(fileRec.original_name + ': no data rows found'); continue; }

      // Route to the right ingester based on category and selected modules
      if ((cat === 'KPI Data' || !cat) && (!modules || modules.includes('kpi'))) {
        result.kpi += await ingestKPIData(rows);
      }
      if ((cat === 'Issue Log') && (!modules || modules.includes('issues'))) {
        result.issues += await ingestIssues(rows);
      }
      if (cat === 'Issue Log' && (!modules || modules.includes('qips'))) {
        // Try QIP columns too
        const hasQIP = rows.some(r => Object.keys(r).some(k => norm(k).includes('qip') || norm(k).includes('phase') || norm(k).includes('dmaic')));
        if (hasQIP) result.qips += await ingestQIPs(rows);
      }
      // If General / ambiguous, try all parsers
      if (cat === 'General') {
        const k = await ingestKPIData(rows);
        const i = await ingestIssues(rows);
        result.kpi += k; result.issues += i;
      }
    }
    res.json({ success: true, ...result });
  } catch(e) {
    console.error('Analyse error:', e);
    res.status(500).json({ error: e.message });
  }
});

let upload = null;
try {
  const multer = require('multer');
  upload = multer({ storage: multer.diskStorage({
    destination: (_r,_f,cb) => cb(null, uploadDir),
    filename: (_r,f,cb) => cb(null, Date.now()+'_'+f.originalname.replace(/[^a-zA-Z0-9._-]/g,'_'))
  }), limits: { fileSize: 50*1024*1024 } });
} catch(e) { console.warn('multer not available'); }

app.post('/api/upload', (req, res, next) => {
  if (!upload) return res.status(503).json({ error: 'Uploads not available' });
  upload.array('files', 20)(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files?.length) return res.status(400).json({ error: 'No files' });
    const saved = [];
    for (const f of req.files) {
      const fid = 'f_'+Date.now()+'_'+Math.random().toString(36).slice(2,5);
      try {
        await q(`INSERT INTO uploaded_files (file_id,original_name,stored_name,mimetype,size,category) VALUES ($1,$2,$3,$4,$5,$6)`,
          [fid,f.originalname,f.filename,f.mimetype,f.size,req.body.category||'General']);
        saved.push({ id:fid, name:f.originalname, size:f.size });
      } catch(e) {}
    }
    res.json({ success: true, files: saved });
  });
});

// ══════════════════════════════════════════════════════════════
// CATCH-ALL (must be LAST)
// ══════════════════════════════════════════════════════════════
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ══════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log('\n🚀 JK Tyre server on port', PORT);
  console.log('   DATABASE_URL:', process.env.DATABASE_URL ? 'SET ✅' : 'MISSING ❌');
  console.log('   Diagnose: /db-check.html\n');
});
setupDB();
