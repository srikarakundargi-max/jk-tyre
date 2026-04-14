const express = require('express');
const router = express.Router();
const db = require('../db');

// GET CFM review (latest or by council+period)
router.get('/', async (req, res) => {
  const { council = 'Delivery Management', period } = req.query;
  try {
    let query = 'SELECT * FROM cfm_reviews WHERE council=$1';
    const params = [council];
    if (period) { query += ' AND period=$2'; params.push(period); }
    query += ' ORDER BY updated_at DESC LIMIT 1';
    const result = await db.query(query, params);
    if (!result.rows.length) return res.json(null);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET list of all periods for a council
router.get('/periods', async (req, res) => {
  const { council = 'Delivery Management' } = req.query;
  try {
    const result = await db.query(
      'SELECT period, updated_at FROM cfm_reviews WHERE council=$1 ORDER BY period DESC',
      [council]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT save CFM review (upsert)
router.put('/', async (req, res) => {
  const {
    council = 'Delivery Management',
    period = '2026-01',
    kpi_data = [],
    mom_data = [],
    actions_data = [],
    achievements = [],
    priorities = []
  } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO cfm_reviews (council, period, kpi_data, mom_data, actions_data, achievements, priorities)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (council, period) DO UPDATE SET
         kpi_data=$3, mom_data=$4, actions_data=$5,
         achievements=$6, priorities=$7, updated_at=NOW()
       RETURNING *`,
      [council, period,
       JSON.stringify(kpi_data), JSON.stringify(mom_data),
       JSON.stringify(actions_data), JSON.stringify(achievements),
       JSON.stringify(priorities)]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
