const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('⚠️  DATABASE_URL is not set. Database features will be disabled.');
  console.error('    → In Railway: open your web service → Variables tab → check DATABASE_URL is present.');
  console.error('    → If missing: go to your PostgreSQL service → Connect → copy DATABASE_URL → add it manually to your web service Variables.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost/jk_tyre_dev',
  // Railway PostgreSQL ALWAYS requires this SSL setting
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ Unexpected DB pool error:', err.message);
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ DB connection FAILED:', err.message);
    console.error('   DATABASE_URL is set:', !!process.env.DATABASE_URL);
  } else {
    console.log('✅ PostgreSQL connected successfully');
    release();
  }
});

module.exports = pool;
