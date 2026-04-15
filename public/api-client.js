/**
 * JK Tyre API Client v4
 * - Seeds ALL 47 hardcoded issues + 19 QIPs to DB on first run
 * - Uses ON CONFLICT DO NOTHING — never erases user edits
 * - Loads from DB on every page load so all sections stay in sync
 */

// ── Fetch helpers ──────────────────────────────────────────────
const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
    return r.json();
  },
  async post(url, data) {
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!r.ok) throw new Error(`POST ${url} → ${r.status}: ${await r.text()}`);
    return r.json();
  },
  async put(url, data) {
    const r = await fetch(url, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!r.ok) throw new Error(`PUT ${url} → ${r.status}`);
    return r.json();
  },
  async patch(url, data) {
    const r = await fetch(url, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!r.ok) throw new Error(`PATCH ${url} → ${r.status}`);
    return r.json();
  }
};

// ── Toast ─────────────────────────────────────────────────────
function toast(msg, color) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.background = color || '';
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.style.background = ''; }, 3500);
}
const toastOK  = msg => toast('✅ ' + msg, '#2E7D32');
const toastErr = msg => toast('❌ ' + msg, '#C62828');

// ── DB row → frontend issue object ─────────────────────────────
function rowToIssue(r) {
  return {
    id: r.id, date: r.date, func: r.func, reporter: r.reporter,
    desc: r.description,          // DB: description → frontend: desc
    location: r.location, channel: r.channel, priority: r.priority,
    rcaDone: r.rca_done, rootCause: r.root_cause,
    action: r.action, assignee: r.assignee, target: r.target,
    status: r.status, progress: r.progress,
    impact: r.impact, resources: r.resources,
    qip: r.qip, businessImpact: r.business_impact
  };
}

// ── DB row → frontend QIP object ──────────────────────────────
function rowToQIP(r) {
  return {
    id: r.id, title: r.title, phase: r.phase, owner: r.owner,
    target: r.target, status: r.status, progress: r.progress,
    channel: r.channel, priority: r.priority,
    objective: r.objective, expectedOutcome: r.expected_outcome,
    issues: Array.isArray(r.issues) ? r.issues : (r.issues || [])
  };
}

// ══════════════════════════════════════════════════════════════
// ISSUES — seed + load
// ══════════════════════════════════════════════════════════════
async function seedAndLoadIssues() {
  try {
    // 1. Bulk-seed all hardcoded issues (ON CONFLICT DO NOTHING = safe always)
    const payload = ISSUES.map(i => ({
      id: i.id, date: i.date, func: i.func, reporter: i.reporter,
      description: i.desc, location: i.location, channel: i.channel,
      priority: i.priority, rca_done: i.rcaDone || false,
      root_cause: i.rootCause || '', action: i.action || '',
      assignee: i.assignee || '', target: i.target || '',
      status: i.status || 'Open', progress: i.progress || 0,
      impact: i.impact || '', resources: i.resources || '',
      qip: i.qip || '', business_impact: i.businessImpact || ''
    }));
    const seedResult = await API.post('/api/issues/bulk-seed', payload);
    if (seedResult.seeded > 0) console.log('[DB] Seeded', seedResult.seeded, 'new issues');

    // 2. Load all issues from DB (includes hardcoded + user-added)
    const rows = await API.get('/api/issues');
    ISSUES.length = 0;
    rows.forEach(r => ISSUES.push(rowToIssue(r)));

    // 3. Refresh all issue-dependent views
    if (typeof populateIssueTable === 'function') populateIssueTable(ISSUES);
    if (typeof filterIssues === 'function') filterIssues();

    console.log('[DB] ✅ Issues: loaded', rows.length, 'from database');
  } catch (err) {
    console.error('[DB] Issues load failed:', err.message);
    toastErr('Database error: ' + err.message);
  }
}

// ══════════════════════════════════════════════════════════════
// QIPs — seed + load
// ══════════════════════════════════════════════════════════════
async function seedAndLoadQIPs() {
  try {
    // 1. Bulk-seed all hardcoded QIPs
    const payload = QIPS.map(q => ({
      id: q.id, title: q.title, phase: q.phase, owner: q.owner,
      target: q.target, status: q.status || 'In Progress',
      progress: q.progress || 0, channel: q.channel,
      priority: q.priority || 'HIGH', objective: q.objective || '',
      expectedOutcome: q.expectedOutcome || '', issues: q.issues || []
    }));
    const seedResult = await API.post('/api/qips/bulk-seed', payload);
    if (seedResult.seeded > 0) console.log('[DB] Seeded', seedResult.seeded, 'new QIPs');

    // 2. Load all QIPs from DB
    const rows = await API.get('/api/qips');
    QIPS.length = 0;
    rows.forEach(r => QIPS.push(rowToQIP(r)));

    // 3. Refresh QIP view
    if (typeof populateQIPs === 'function') populateQIPs(QIPS);

    console.log('[DB] ✅ QIPs: loaded', rows.length, 'from database');
  } catch (err) {
    console.error('[DB] QIPs load failed:', err.message);
  }
}

// ══════════════════════════════════════════════════════════════
// KPI SCORECARD — save/load
// ══════════════════════════════════════════════════════════════
async function saveKPIScorecard() {
  try {
    await API.put('/api/kpi-data/scorecard', DM_KPI_SCORECARD || KPI_SCORECARD);
    toastOK('KPI Scorecard saved!');
  } catch(e) { toastErr('KPI save failed: ' + e.message); }
}

async function loadKPIScorecard() {
  try {
    const data = await API.get('/api/kpi-data/scorecard');
    if (!data) return;
    // Update DM_KPI_SCORECARD in place
    const arr = DM_KPI_SCORECARD || KPI_SCORECARD;
    data.forEach(saved => {
      const idx = arr.findIndex(k => k.kpi === saved.kpi);
      if (idx >= 0) Object.assign(arr[idx], saved);
    });
    console.log('[DB] KPI Scorecard loaded');
  } catch(e) { console.warn('[DB] KPI Scorecard load:', e.message); }
}

// ══════════════════════════════════════════════════════════════
// DEPT KPIs — save/load
// ══════════════════════════════════════════════════════════════
async function loadDeptKPIs(key) {
  try {
    const rows = await API.get('/api/kpis/dept/' + key);
    if (!rows.length) return;
    if (typeof _deptKpiStore !== 'undefined') {
      _deptKpiStore[key] = rows.map(r => ({
        name: r.name, unit: r.unit, target: r.target, actual: r.actual,
        prev: r.prev, owner: r.owner, freq: r.freq, remarks: r.remarks, higher: r.higher
      }));
      if (typeof renderDeptKPITable   === 'function') renderDeptKPITable(key);
      if (typeof renderDeptSummaryCards === 'function') renderDeptSummaryCards(key);
      if (typeof renderDeptKPIChart   === 'function') renderDeptKPIChart(key);
    }
  } catch(e) { console.warn('[DB] DeptKPI load', key, e.message); }
}

window.saveKPIs = async function(dept) {
  if (!dept) {
    // Save all
    const keys = Object.keys(typeof DEPT_KPIS_CONFIG !== 'undefined' ? DEPT_KPIS_CONFIG : {});
    for (const k of keys) {
      try { await API.put('/api/kpis/dept/'+k, (typeof _deptKpiStore !== 'undefined' ? _deptKpiStore[k] : []) || []); }
      catch(e) { console.warn('[DB] save dept KPI', k, e.message); }
    }
    toastOK('All KPIs saved!');
    return;
  }
  try {
    await API.put('/api/kpis/dept/'+dept, (typeof _deptKpiStore !== 'undefined' ? _deptKpiStore[dept] : []) || []);
    if (typeof renderDeptKPITable    === 'function') renderDeptKPITable(dept);
    if (typeof renderDeptSummaryCards === 'function') renderDeptSummaryCards(dept);
    if (typeof renderDeptKPIChart    === 'function') renderDeptKPIChart(dept);
    toastOK((typeof DEPT_KPIS_CONFIG !== 'undefined' ? DEPT_KPIS_CONFIG[dept]?.label : dept) + ' KPIs saved!');
  } catch(e) { toastErr('KPI save failed: ' + e.message); }
};

// ══════════════════════════════════════════════════════════════
// CFM REVIEW
// ══════════════════════════════════════════════════════════════
async function loadCFMReview() {
  try {
    const council = document.getElementById('cfm-council')?.value || 'Delivery Management';
    const period  = document.getElementById('cfm-month')?.value   || '2026-01';
    const data = await API.get('/api/cfm?council='+encodeURIComponent(council)+'&period='+period);
    if (!data) return;
    if (data.kpi_data?.length)     window._cfmKpiData      = data.kpi_data;
    if (data.mom_data?.length)     window._cfmMOMData      = data.mom_data;
    if (data.actions_data?.length) window._cfmActionsData  = data.actions_data;
    if (data.achievements?.length) window._cfmAchievements = data.achievements;
    if (data.priorities?.length)   window._cfmPriorities   = data.priorities;
    ['renderCFMKPITable','renderCFMMOMTable','renderCFMActionsTable',
     'renderCFMAchievements','renderCFMPriorities','updateCFMStatBanner']
      .forEach(fn => { if (typeof window[fn] === 'function') window[fn](); });
    console.log('[DB] CFM Review loaded');
  } catch(e) { console.warn('[DB] CFM load:', e.message); }
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
  } catch(e) { toastErr('CFM save failed: ' + e.message); }
};

// ══════════════════════════════════════════════════════════════
// TUBE & FLAP + OE CONFIG
// ══════════════════════════════════════════════════════════════
window.saveTubeFlap = async function() {
  try {
    const data = {};
    document.querySelectorAll('[id^="tf-"]').forEach(el => { if(el.value !== undefined) data[el.id] = el.value; });
    await API.put('/api/settings/tube-flap', data);
    toastOK('Tube & Flap schedule saved!');
  } catch(e) { toastErr('Save failed: ' + e.message); }
};

window.saveOEConfig = async function() {
  try {
    const data = {};
    document.querySelectorAll('[id^="oe-"]').forEach(el => { if(el.value !== undefined) data[el.id] = el.value; });
    await API.put('/api/settings/oe-config', data);
    toastOK('OE Config saved!');
  } catch(e) { toastErr('Save failed: ' + e.message); }
};

async function loadSettings(key, idPrefix) {
  try {
    const data = await API.get('/api/settings/' + key);
    Object.entries(data).forEach(([id, val]) => { const el = document.getElementById(id); if(el) el.value = val; });
  } catch(e) { console.warn('[DB] loadSettings', key, e.message); }
}

// ══════════════════════════════════════════════════════════════
// SUBMIT NEW ISSUE — saves to DB, keeps all 47 intact
// ══════════════════════════════════════════════════════════════
window.submitNewIssue = async function() {
  const desc = document.getElementById('ni-desc')?.value?.trim();
  if (!desc) { alert('Please enter issue description'); return; }

  // Generate next ID based on current max in DB
  const maxNum = ISSUES.reduce((mx, i) => {
    const n = parseInt(i.id.replace('DM-', '')) || 0;
    return n > mx ? n : mx;
  }, 0);
  const newId = 'DM-' + String(maxNum + 1).padStart(3, '0');

  const newIssue = {
    id: newId,
    date: new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'2-digit'}),
    func:     document.getElementById('ni-func')?.value     || '',
    reporter: document.getElementById('ni-reporter')?.value || 'Anonymous',
    desc,
    location: document.getElementById('ni-location')?.value || 'TBD',
    channel:  document.getElementById('ni-channel')?.value  || '',
    priority: document.getElementById('ni-priority')?.value || 'MEDIUM',
    rcaDone: false,
    rootCause: document.getElementById('ni-rca')?.value     || '',
    action: '', assignee: document.getElementById('ni-assignee')?.value || '',
    target:   document.getElementById('ni-target')?.value   || '',
    status: 'Open', progress: 0,
    impact:   document.getElementById('ni-impact')?.value   || 'Under assessment',
    resources: document.getElementById('ni-resources')?.value || 'TBD',
    qip: '', businessImpact: document.getElementById('ni-impact')?.value || 'TBD'
  };

  try {
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
    ISSUES.unshift(newIssue);
    if (typeof populateIssueTable === 'function') populateIssueTable(ISSUES);
    if (typeof closeModal === 'function') closeModal('addIssueModal');
    toastOK('Issue ' + newIssue.id + ' saved! (' + ISSUES.length + ' total)');
    console.log('[DB] New issue saved:', newIssue.id, '— total:', ISSUES.length);
  } catch(err) {
    toastErr('Save failed: ' + err.message);
  }
};

// ══════════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════
const _origHandleFiles = window.handleFiles;
window.handleFiles = async function(files, category) {
  if (_origHandleFiles) _origHandleFiles(files, category);
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('files', f));
  fd.append('category', category || 'General');
  try { await fetch('/api/upload', { method:'POST', body:fd }); }
  catch(e) { console.warn('[DB] Upload failed:', e.message); }
};

// ══════════════════════════════════════════════════════════════
// SECTION SWITCH HOOK — lazy-load CFM when section opens
// ══════════════════════════════════════════════════════════════
const _origShowSection = window.showSection;
window.showSection = function(id, el) {
  if (_origShowSection) _origShowSection(id, el);
  if (id === 'cfm_review') setTimeout(loadCFMReview, 150);
};

// ══════════════════════════════════════════════════════════════
// INIT — called once DOM is ready
// ══════════════════════════════════════════════════════════════
async function initFromDB() {
  try {
    await API.get('/api/health');
    console.log('[DB] Server reachable ✅');
  } catch(e) {
    console.error('[DB] Server not reachable:', e.message);
    toastErr('Cannot reach server API');
    return;
  }

  // Run in parallel where possible
  await Promise.all([
    seedAndLoadIssues(),
    seedAndLoadQIPs()
  ]);

  // Load KPI + settings
  await loadKPIScorecard();
  await loadSettings('tube-flap');
  await loadSettings('oe-config');

  // Load dept KPIs if config exists
  if (typeof DEPT_KPIS_CONFIG !== 'undefined') {
    for (const k of Object.keys(DEPT_KPIS_CONFIG)) await loadDeptKPIs(k);
  }

  console.log('[DB] ✅ All data loaded — ISSUES:', ISSUES.length, '| QIPs:', QIPS.length);
}

// Wait for app to finish initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initFromDB, 400));
} else {
  setTimeout(initFromDB, 400);
}

console.log('[DB] api-client.js v4 loaded');
