const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Tube & Flap Schedule ──────────────────────────────────────

router.get('/tube-flap', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM tube_flap_schedule ORDER BY id DESC LIMIT 1');
    res.json(result.rows[0]?.data || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/tube-flap', async (req, res) => {
  try {
    const existing = await db.query('SELECT id FROM tube_flap_schedule LIMIT 1');
    if (existing.rows.length) {
      await db.query('UPDATE tube_flap_schedule SET data=$1, updated_at=NOW() WHERE id=$2',
        [JSON.stringify(req.body), existing.rows[0].id]);
    } else {
      await db.query('INSERT INTO tube_flap_schedule (data) VALUES ($1)', [JSON.stringify(req.body)]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── OE Config ─────────────────────────────────────────────────

router.get('/oe-config', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM oe_config ORDER BY id DESC LIMIT 1');
    res.json(result.rows[0]?.data || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/oe-config', async (req, res) => {
  try {
    const existing = await db.query('SELECT id FROM oe_config LIMIT 1');
    if (existing.rows.length) {
      await db.query('UPDATE oe_config SET data=$1, updated_at=NOW() WHERE id=$2',
        [JSON.stringify(req.body), existing.rows[0].id]);
    } else {
      await db.query('INSERT INTO oe_config (data) VALUES ($1)', [JSON.stringify(req.body)]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── File Uploads ───────────────────────────────────────────────

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv', '.pdf', '.pptx', '.ppt', '.docx', '.doc', '.json', '.txt', '.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

router.post('/upload', upload.array('files', 20), async (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
  try {
    const saved = [];
    for (const file of req.files) {
      const fileId = 'f_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      await db.query(
        `INSERT INTO uploaded_files (file_id, original_name, stored_name, mimetype, size, category)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [fileId, file.originalname, file.filename, file.mimetype, file.size, req.body.category || 'General']
      );
      saved.push({ id: fileId, name: file.originalname, size: file.size });
    }
    res.json({ success: true, files: saved });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/files', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM uploaded_files ORDER BY uploaded_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/files/:fileId', async (req, res) => {
  try {
    const result = await db.query('SELECT stored_name FROM uploaded_files WHERE file_id=$1', [req.params.fileId]);
    if (result.rows.length) {
      const filePath = path.join(uploadDir, result.rows[0].stored_name);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await db.query('DELETE FROM uploaded_files WHERE file_id=$1', [req.params.fileId]);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
