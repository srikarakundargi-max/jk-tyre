const express = require('express');
const router = express.Router();
const db = require('../db');

// ── Scorecard ─────────────────────────────────────────────────

router.get('/scorecard', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM kpi_scorecard ORDER BY id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/scorecard', async (req, res) => {
  const rows = req.body; // array of KPI objects
  try {
    for (const r of rows) {
      await db.query(
        `INSERT INTO kpi_scorecard (kpi, baseline, current_val, target, gap, pct, status, trend, lower_is_better, owner, action)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (kpi) DO UPDATE SET
           baseline=$2, current_val=$3, target=$4, gap=$5, pct=$6,
           status=$7, trend=$8, lower_is_better=$9, owner=$10, action=$11, updated_at=NOW()`,
        [r.kpi, r.baseline, r.current ?? r.current_val, r.target, r.gap, r.pct,
         r.status, r.trend, r.lower ?? r.lower_is_better, r.owner, r.action]
      );
    }
    res.json({ success: true, count: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lag KPIs ─────────────────────────────────────────────────

router.get('/lag', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM lag_kpis ORDER BY id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/lag', async (req, res) => {
  const rows = req.body;
  try {
    for (const r of rows) {
      await db.query(
        `INSERT INTO lag_kpis (kpi, def, formula, source, owner, target, baseline, m3, m2, m1, current_val, trend, status, impact, lower_is_better)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (kpi) DO UPDATE SET
           def=$2, formula=$3, source=$4, owner=$5, target=$6, baseline=$7,
           m3=$8, m2=$9, m1=$10, current_val=$11, trend=$12, status=$13,
           impact=$14, lower_is_better=$15, updated_at=NOW()`,
        [r.kpi, r.def, r.formula, r.source, r.owner,
         parseFloat(r.target) || null, parseFloat(r.baseline) || null,
         parseFloat(r.m3) || null, parseFloat(r.m2) || null,
         parseFloat(r.m1) || null, parseFloat(r.current ?? r.current_val) || null,
         r.trend, r.status, r.impact, r.lower ?? false]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Lead Indicators ───────────────────────────────────────────

router.get('/lead', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM lead_indicators ORDER BY id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/lead', async (req, res) => {
  const rows = req.body;
  try {
    for (const r of rows) {
      await db.query(
        `INSERT INTO lead_indicators (kpi, def, target, owner, linked, baseline, m3, m2, m1, current_val, trend, status, action, lower_is_better)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (kpi) DO UPDATE SET
           def=$2, target=$3, owner=$4, linked=$5, baseline=$6,
           m3=$7, m2=$8, m1=$9, current_val=$10, trend=$11,
           status=$12, action=$13, lower_is_better=$14, updated_at=NOW()`,
        [r.kpi, r.def, String(r.target), r.owner, r.linked,
         String(r.baseline), String(r.m3), String(r.m2), String(r.m1),
         String(r.current ?? r.current_val), r.trend, r.status, r.action, r.lower ?? false]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Department KPIs ───────────────────────────────────────────

router.get('/dept/:dept', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM dept_kpis WHERE dept_key=$1 ORDER BY sort_order, id',
      [req.params.dept]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk save/replace all dept KPIs
router.put('/dept/:dept', async (req, res) => {
  const dept = req.params.dept;
  const rows = req.body; // full array
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM dept_kpis WHERE dept_key=$1', [dept]);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      await client.query(
        `INSERT INTO dept_kpis (dept_key, name, unit, target, actual, prev, owner, freq, remarks, higher, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [dept, r.name, r.unit||'', String(r.target||''), String(r.actual||''),
         String(r.prev||''), r.owner||'', r.freq||'Monthly', r.remarks||'',
         r.higher !== false, i]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, count: rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
