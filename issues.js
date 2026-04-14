const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all issues
router.get('/', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM issues ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single issue
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM issues WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create issue
router.post('/', async (req, res) => {
  const {
    id, date, func, reporter, description, location, channel, priority,
    rca_done, root_cause, action, assignee, target, status, progress,
    impact, resources, qip, business_impact
  } = req.body;

  try {
    const result = await db.query(
      `INSERT INTO issues (id, date, func, reporter, description, location, channel, priority,
        rca_done, root_cause, action, assignee, target, status, progress, impact, resources, qip, business_impact)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [id, date, func, reporter, description, location, channel, priority,
       rca_done || false, root_cause || '', action || '', assignee || '', target || '',
       status || 'Open', progress || 0, impact || '', resources || '', qip || '', business_impact || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update issue
router.put('/:id', async (req, res) => {
  const {
    date, func, reporter, description, location, channel, priority,
    rca_done, root_cause, action, assignee, target, status, progress,
    impact, resources, qip, business_impact
  } = req.body;

  try {
    const result = await db.query(
      `UPDATE issues SET
        date=$1, func=$2, reporter=$3, description=$4, location=$5, channel=$6,
        priority=$7, rca_done=$8, root_cause=$9, action=$10, assignee=$11,
        target=$12, status=$13, progress=$14, impact=$15, resources=$16,
        qip=$17, business_impact=$18, updated_at=NOW()
       WHERE id=$19 RETURNING *`,
      [date, func, reporter, description, location, channel, priority,
       rca_done, root_cause, action, assignee, target, status, progress,
       impact, resources, qip, business_impact, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH partial update (for quick field updates like progress/status)
router.patch('/:id', async (req, res) => {
  const fields = req.body;
  const keys = Object.keys(fields);
  if (!keys.length) return res.status(400).json({ error: 'No fields provided' });

  // Map camelCase to snake_case column names
  const colMap = {
    rcaDone: 'rca_done', rootCause: 'root_cause', businessImpact: 'business_impact'
  };

  const setClauses = keys.map((k, i) => `${colMap[k] || k} = $${i + 1}`);
  const values = keys.map(k => fields[k]);
  values.push(req.params.id);

  try {
    const result = await db.query(
      `UPDATE issues SET ${setClauses.join(', ')}, updated_at=NOW() WHERE id=$${values.length} RETURNING *`,
      values
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE issue
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM issues WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
