/**
 * JK Tyre — API Client v3
 * Wires all Save buttons and form submissions to the real backend.
 * Uses CORRECT function names from the HTML source.
 */

// ── Simple fetch helpers ───────────────────────────────────────
const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`GET ${url} → ${r.status}: ${await r.text()}`);
    return r.json();
  },
  async post(url, data) {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!r.ok) throw new Error(`POST ${url} → ${r.status}: ${await r.text()}`);
    return r.json();
  },
  async put(url, data) {
    const r = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!r.ok) throw new Error(`PUT ${url} → ${r.status}: ${await r.text()}`);
    return r.json();
  },
  async patch(url, data) {
    const r = await fetch(url, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!r.ok) throw new Error(`PATCH ${url} → ${r.status}: ${await r.text()}`);
    return r.json();
  },
  async del(url) {
    const r = await fetch(url, { method:'DELETE' });
    if (!r.ok) throw new Error(`DELETE ${url} → ${r.status}`);
    return r.json();
  }
};

// ── Toast helpers ─────────────────────────────────────────────
function toast(msg, color) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  if (color) t.style.background = color;
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.style.background = ''; }, 3000);
}
const toastOK  = msg => toast('✅ ' + msg, '#2E7D32');
const toastErr = msg => toast('❌ ' + msg, '#C62828');

// ── Convert DB row → frontend issue object (MUST use 'desc' field) ──
function dbRowToIssue(r) {
  return {
    id:            r.id,
    date:          r.date,
    func:          r.func,
    reporter:      r.reporter,
    desc:          r.description,   // DB column = description, frontend = desc
    location:      r.location,
    channel:       r.channel,
    priority:      r.priority,
    rcaDone:       r.rca_done,
    rootCause:     r.root_cause,
    action:        r.action,
    assignee:      r.assignee,
    target:        r.target,
    status:        r.status,
    progress:      r.progress,
    impact:        r.impact,
    resources:     r.resources,
    qip:           r.qip,
    businessImpact: r.business_impact
  };
}

// ══════════════════════════════════════════════════════════════
// ISSUES
// ══════════════════════════════════════════════════════════════

// Load issues from DB and replace in-memory array
async function loadIssues() {
  try {
    const rows = await API.get('/api/issues');
    if (!rows.length) {
      // First run — seed all hardcoded issues into DB silently
      console.log('[DB] No issues found — seeding initial data...');
      for (const issue of ISSUES) {
        await API.post('/api/issues', {
          id: issue.id, date: issue.date, func: issue.func,
          reporter: issue.reporter, description: issue.desc,
          location: issue.location, channel: issue.channel,
          priority: issue.priority, rca_done: issue.rcaDone || false,
          root_cause: issue.rootCause || '', action: issue.action || '',
          assignee: issue.assignee || '', target: issue.target || '',
          status: issue.status || 'Open', progress: issue.progress || 0,
          impact: issue.impact || '', resources: issue.resources || '',
          qip: issue.qip || '', business_impact: issue.businessImpact || ''
        }).catch(() => {}); // skip duplicates silently
      }
      console.log('[DB] Seed done');
    } else {
      // Replace the global ISSUES array with DB data
      ISSUES.length = 0;
      rows.forEach(r => ISSUES.push(dbRowToIssue(r)));
      // Refresh the table (correct function name from HTML source)
      if (typeof populateIssueTable === 'function') populateIssueTable(ISSUES);
      console.log('[DB] Loaded', rows.length, 'issues from database');
    }
  } catch (err) {
    console.error('[DB] loadIssues failed:', err.message);
  }
}

// Override submitNewIssue with DB-saving version
window.submitNewIssue = async function() {
  const desc = document.getElementById('ni-desc')?.value?.trim();
  if (!desc) { alert('Please enter issue description'); return; }

  const newIssue = {
    id:       'DM-' + String(ISSUES.length + 1).padStart(3, '0'),
    date:     new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' }),
    func:     document.getElementById('ni-func')?.value || '',
    reporter: document.getElementById('ni-reporter')?.value || 'Anonymous',
    desc:     desc,
    location: document.getElementById('ni-location')?.value || 'TBD',
    channel:  document.getElementById('ni-channel')?.value || '',
    priority: document.getElementById('ni-priority')?.value || 'MEDIUM',
    rcaDone:  false,
    rootCause: document.getElementById('ni-rca')?.value || '',
    action: '', assignee: document.getElementById('ni-assignee')?.value || '',
    target:   document.getElementById('ni-target')?.value || '',
    status: 'Open', progress: 0,
    impact:   document.getElementById('ni-impact')?.value || 'Under assessment',
    resources: document.getElementById('ni-resources')?.value || 'TBD',
    qip: '', businessImpact: document.getElementById('ni-impact')?.value || 'TBD'
  };

  try {
    // Save to database
    await API.post('/api/issues', {
      id: newIssue.id, date: newIssue.date, func: newIssue.func,
      reporter: newIssue.reporter, description: newIssue.desc,
      location: newIssue.location, channel: newIssue.channel,
      priority: newIssue.priority, rca_done: false,
      root_cause: newIssue.rootCause, action: '', assignee: newIssue.assignee,
      target: newIssue.target, status: 'Open', progress: 0,
      impact: newIssue.impact, resources: newIssue.resources,
      qip: '', business_impact: newIssue.businessImpact
    });

    // Update local array and refresh table
    ISSUES.unshift(newIssue);
    if (typeof populateIssueTable === 'function') populateIssueTable(ISSUES);
    if (typeof closeModal === 'function') closeModal('addIssueModal');
    toastOK('Issue ' + newIssue.id + ' saved to database!');
    console.log('[DB] Issue saved:', newIssue.id);
  } catch (err) {
    toastErr('Save failed: ' + err.message);
    console.error('[DB] submitNewIssue failed:', err);
  }
};

// ══════════════════════════════════════════════════════════════
// DEPT KPIs — saveKPIs(dept)
// ══════════════════════════════════════════════════════════════

async function loadDeptKPIs(key) {
  try {
    const rows = await API.get('/api/kpis/dept/' + key);
    if (!rows.length) return;
    _deptKpiStore[key] = rows.map(r => ({
      name: r.name, unit: r.unit, target: r.target, actual: r.actual,
      prev: r.prev, owner: r.owner, freq: r.freq, remarks: r.remarks, higher: r.higher
    }));
    if (typeof renderDeptKPITable   === 'function') renderDeptKPITable(key);
    if (typeof renderDeptSummaryCards === 'function') renderDeptSummaryCards(key);
    if (typeof renderDeptKPIChart   === 'function') renderDeptKPIChart(key);
    console.log('[DB] Loaded', rows.length, 'KPIs for', key);
  } catch (err) { console.error('[DB] loadDeptKPIs failed for', key, err.message); }
}

window.saveKPIs = async function(dept) {
  if (dept) {
    try {
      await API.put('/api/kpis/dept/' + dept, _deptKpiStore[dept] || []);
      if (typeof renderDeptKPITable    === 'function') renderDeptKPITable(dept);
      if (typeof renderDeptSummaryCards === 'function') renderDeptSummaryCards(dept);
      if (typeof renderDeptKPIChart    === 'function') renderDeptKPIChart(dept);
      toastOK((DEPT_KPIS_CONFIG?.[dept]?.label || dept) + ' KPIs saved!');
    } catch (err) { toastErr('KPI save failed: ' + err.message); }
  } else {
    let ok = true;
    for (const key of Object.keys(_deptKpiStore || {})) {
      try { await API.put('/api/kpis/dept/' + key, _deptKpiStore[key]); }
      catch (err) { ok = false; console.error('[DB] save KPI failed:', key, err.message); }
    }
    ok ? toastOK('All KPIs saved!') : toastErr('Some KPIs failed — check console');
  }
};

// ══════════════════════════════════════════════════════════════
// CFM REVIEW — saveCFMReview()
// ══════════════════════════════════════════════════════════════

async function loadCFMReview() {
  try {
    const council = document.getElementById('cfm-council')?.value || 'Delivery Management';
    const period  = document.getElementById('cfm-month')?.value   || '2026-01';
    const data = await API.get('/api/cfm?council=' + encodeURIComponent(council) + '&period=' + period);
    if (!data) return;
    if (data.kpi_data?.length)     window._cfmKpiData      = data.kpi_data;
    if (data.mom_data?.length)     window._cfmMOMData      = data.mom_data;
    if (data.actions_data?.length) window._cfmActionsData  = data.actions_data;
    if (data.achievements?.length) window._cfmAchievements = data.achievements;
    if (data.priorities?.length)   window._cfmPriorities   = data.priorities;
    if (typeof renderCFMKPITable     === 'function') renderCFMKPITable();
    if (typeof renderCFMMOMTable     === 'function') renderCFMMOMTable();
    if (typeof renderCFMActionsTable === 'function') renderCFMActionsTable();
    if (typeof renderCFMAchievements === 'function') renderCFMAchievements();
    if (typeof renderCFMPriorities   === 'function') renderCFMPriorities();
    if (typeof updateCFMStatBanner   === 'function') updateCFMStatBanner();
    console.log('[DB] CFM Review loaded');
  } catch (err) { console.error('[DB] loadCFMReview failed:', err.message); }
}

window.saveCFMReview = async function() {
  try {
    const council = document.getElementById('cfm-council')?.value || 'Delivery Management';
    const period  = document.getElementById('cfm-month')?.value   || '2026-01';
    await API.put('/api/cfm', {
      council, period,
      kpi_data:     window._cfmKpiData      || [],
      mom_data:     window._cfmMOMData      || [],
      actions_data: window._cfmActionsData  || [],
      achievements: window._cfmAchievements || [],
      priorities:   window._cfmPriorities   || []
    });
    if (typeof updateCFMStatBanner === 'function') updateCFMStatBanner();
    toastOK('CFM Review saved!');
  } catch (err) { toastErr('CFM save failed: ' + err.message); }
};

// ══════════════════════════════════════════════════════════════
// TUBE & FLAP
// ══════════════════════════════════════════════════════════════

window.saveTubeFlap = async function() {
  try {
    const data = {};
    document.querySelectorAll('[id^="tf-"]').forEach(el => { if (el.value !== undefined) data[el.id] = el.value; });
    await API.put('/api/settings/tube-flap', data);
    toastOK('Tube & Flap schedule saved!');
  } catch (err) { toastErr('Save failed: ' + err.message); }
};

async function loadTubeFlap() {
  try {
    const data = await API.get('/api/settings/tube-flap');
    Object.entries(data).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
  } catch (err) { console.error('[DB] loadTubeFlap:', err.message); }
}

// ══════════════════════════════════════════════════════════════
// OE CONFIG
// ══════════════════════════════════════════════════════════════

window.saveOEConfig = async function() {
  try {
    const data = {};
    document.querySelectorAll('[id^="oe-"]').forEach(el => { if (el.value !== undefined) data[el.id] = el.value; });
    await API.put('/api/settings/oe-config', data);
    toastOK('OE Config saved!');
  } catch (err) { toastErr('Save failed: ' + err.message); }
};

async function loadOEConfig() {
  try {
    const data = await API.get('/api/settings/oe-config');
    Object.entries(data).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
  } catch (err) { console.error('[DB] loadOEConfig:', err.message); }
}

// ══════════════════════════════════════════════════════════════
// FILE UPLOAD — real server upload
// ══════════════════════════════════════════════════════════════

const _origHandleFiles = window.handleFiles;
window.handleFiles = async function(files, category) {
  if (_origHandleFiles) _origHandleFiles(files, category); // keep UI animation
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('files', f));
  fd.append('category', category || 'General');
  try {
    await fetch('/api/upload', { method: 'POST', body: fd });
    console.log('[DB] Files uploaded to server');
  } catch (err) { console.warn('[DB] Upload failed:', err.message); }
};

// ══════════════════════════════════════════════════════════════
// CFM section lazy-load hook
// ══════════════════════════════════════════════════════════════

const _origShowSection = window.showSection;
window.showSection = function(id, el) {
  if (_origShowSection) _origShowSection(id, el);
  if (id === 'cfm') setTimeout(loadCFMReview, 150);
};

// ══════════════════════════════════════════════════════════════
// INIT — runs when page is fully loaded
// ══════════════════════════════════════════════════════════════

async function initFromDB() {
  // Quick health check first
  try {
    const h = await API.get('/api/health');
    console.log('[DB] Server OK:', h);
  } catch (err) {
    console.error('[DB] Server unreachable:', err.message);
    return;
  }

  // Load all data
  await loadIssues();

  const depts = typeof DEPT_KPIS_CONFIG !== 'undefined' ? Object.keys(DEPT_KPIS_CONFIG) : [];
  for (const d of depts) await loadDeptKPIs(d);

  await loadTubeFlap();
  await loadOEConfig();

  console.log('[DB] ✅ All data loaded from database');
}

// Wait for app scripts to fully initialize before overriding
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initFromDB, 300));
} else {
  setTimeout(initFromDB, 300);
}

console.log('[DB] api-client.js v3 loaded');
