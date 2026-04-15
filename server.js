const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Static files ──────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/issues',   require('./routes/issues'));
app.use('/api/kpis',     require('./routes/kpis'));
app.use('/api/cfm',      require('./routes/cfm'));
app.use('/api/settings', require('./routes/settings'));

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── DB status — open this in browser to diagnose connection ──
app.get('/api/db-status', async (req, res) => {
  const info = {
    DATABASE_URL_set: !!process.env.DATABASE_URL,
    DATABASE_URL_preview: process.env.DATABASE_URL
      ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':***@')  // hide password
      : 'NOT SET',
    connected: false,
    tables: [],
    error: null
  };
  try {
    await db.query('SELECT 1');
    info.connected = true;
    const tables = await db.query(
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    );
    info.tables = tables.rows.map(r => r.tablename);
  } catch (err) {
    info.error = err.message;
  }
  res.json(info);
});

// ── DB init: create tables from schema.sql ────────────────────
async function initDB() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    // Split on semicolons so each statement runs individually
    const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await db.query(stmt).catch(err => {
        // Ignore "already exists" errors on re-deploy
        if (!err.message.includes('already exists')) throw err;
      });
    }
    console.log('✅ Database schema ready');
  } catch (err) {
    console.error('❌ DB schema init error:', err.message);
    console.error('   App will still serve HTML — fix DATABASE_URL and redeploy to enable persistence.');
  }
}

// ── Fallback: serve index.html ────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start server (ALWAYS start even if DB fails) ───────────────
app.listen(PORT, () => {
  console.log(`🚀 JK Tyre platform running on port ${PORT}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? 'SET ✅' : 'NOT SET ❌'}`);
  console.log(`   Visit /api/db-status to diagnose database connection`);
});

// Init DB after server is already listening
initDB();
