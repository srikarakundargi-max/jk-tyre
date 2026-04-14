-- JK Tyre Delivery Management Platform — Database Schema
-- Run this once on your Railway PostgreSQL instance

-- ── Issues ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  id            TEXT PRIMARY KEY,
  date          TEXT,
  func          TEXT,
  reporter      TEXT,
  description   TEXT,
  location      TEXT,
  channel       TEXT,
  priority      TEXT DEFAULT 'MEDIUM',
  rca_done      BOOLEAN DEFAULT false,
  root_cause    TEXT DEFAULT '',
  action        TEXT DEFAULT '',
  assignee      TEXT DEFAULT '',
  target        TEXT DEFAULT '',
  status        TEXT DEFAULT 'Open',
  progress      INTEGER DEFAULT 0,
  impact        TEXT DEFAULT '',
  resources     TEXT DEFAULT '',
  qip           TEXT DEFAULT '',
  business_impact TEXT DEFAULT '',
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ── KPI Scorecard ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_scorecard (
  id          SERIAL PRIMARY KEY,
  kpi         TEXT UNIQUE,
  baseline    FLOAT,
  current_val FLOAT,
  target      FLOAT,
  gap         FLOAT,
  pct         FLOAT,
  status      TEXT,
  trend       TEXT,
  lower_is_better BOOLEAN DEFAULT false,
  owner       TEXT,
  action      TEXT,
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── Lag KPIs ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lag_kpis (
  id          SERIAL PRIMARY KEY,
  kpi         TEXT UNIQUE,
  def         TEXT,
  formula     TEXT,
  source      TEXT,
  owner       TEXT,
  target      FLOAT,
  baseline    FLOAT,
  m3          FLOAT,
  m2          FLOAT,
  m1          FLOAT,
  current_val FLOAT,
  trend       TEXT,
  status      TEXT,
  impact      TEXT,
  lower_is_better BOOLEAN DEFAULT false,
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── Lead Indicators ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_indicators (
  id          SERIAL PRIMARY KEY,
  kpi         TEXT UNIQUE,
  def         TEXT,
  target      TEXT,
  owner       TEXT,
  linked      TEXT,
  baseline    TEXT,
  m3          TEXT,
  m2          TEXT,
  m1         TEXT,
  current_val TEXT,
  trend       TEXT,
  status      TEXT,
  action      TEXT,
  lower_is_better BOOLEAN DEFAULT false,
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── Department KPIs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dept_kpis (
  id          SERIAL PRIMARY KEY,
  dept_key    TEXT NOT NULL,
  name        TEXT,
  unit        TEXT DEFAULT '',
  target      TEXT DEFAULT '',
  actual      TEXT DEFAULT '',
  prev        TEXT DEFAULT '',
  owner       TEXT DEFAULT '',
  freq        TEXT DEFAULT 'Monthly',
  remarks     TEXT DEFAULT '',
  higher      BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  updated_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dept_kpis_dept ON dept_kpis(dept_key);

-- ── CFM Review ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cfm_reviews (
  id          SERIAL PRIMARY KEY,
  council     TEXT DEFAULT 'Delivery Management',
  period      TEXT DEFAULT '2026-01',
  kpi_data    JSONB DEFAULT '[]',
  mom_data    JSONB DEFAULT '[]',
  actions_data JSONB DEFAULT '[]',
  achievements JSONB DEFAULT '[]',
  priorities  JSONB DEFAULT '[]',
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(council, period)
);

-- ── Tube & Flap Schedule ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS tube_flap_schedule (
  id          SERIAL PRIMARY KEY,
  data        JSONB DEFAULT '{}',
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── OE Config ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS oe_config (
  id          SERIAL PRIMARY KEY,
  data        JSONB DEFAULT '{}',
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- ── Uploaded Files ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS uploaded_files (
  id            SERIAL PRIMARY KEY,
  file_id       TEXT UNIQUE,
  original_name TEXT,
  stored_name   TEXT,
  mimetype      TEXT,
  size          INTEGER,
  category      TEXT DEFAULT 'General',
  uploaded_at   TIMESTAMP DEFAULT NOW()
);
