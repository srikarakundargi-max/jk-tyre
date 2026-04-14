/**
 * JK Tyre — API Client
 * Overrides all frontend save/load functions to persist data via the backend.
 * Loaded AFTER the main app script so it takes precedence.
 */

const API = {
  async get(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(url, data) {
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(url, data) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async patch(url, data) {
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async delete(url) {
    const r = await fetch(url, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }
};

// ── Helper: show error toast ───────────────────────────────────
function showErrorToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  const orig = t.textContent;
  t.textContent = '❌ ' + msg;
  t.style.background = '#C62828';
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.textContent = orig; t.style.background = ''; }, 3500);
}

// ══════════════════════════════════════════════════════════════
// ISSUES
// ══════════════════════════════════════════════════════════════

// Load issues from DB on startup
async function loadIssuesFromDB() {
  try {
    const rows = await API.get('/api/issues');
    if (!rows.length) return; // keep hardcoded seed data if DB is empty, then seed it
    // Replace the global ISSUES array
    ISSUES.length = 0;
    rows.forEach(r => ISSUES.push({
      id: r.id, date: r.date, func: r.func, reporter: r.reporter,
      desc: r.description, location: r.location, channel: r.channel,
      priority: r.priority, rcaDone: r.rca_done, rootCause: r.root_cause,
      action: r.action, assignee: r.assignee, target: r.target,
      status: r.status, progress: r.progress, impact: r.impact,
      resources: r.resources, qip: r.qip, businessImpact: r.business_impact
    }));
    if (typeof renderIssueTable === 'function') renderIssueTable();
    if (typeof updateBannerStats === 'function') updateBannerStats();
  } catch (err) {
    console.warn('Could not load issues from DB:', err.message);
  }
}

// Seed DB with hardcoded issues if it's empty
async function seedIssuesIfEmpty() {
  try {
    const rows = await API.get('/api/issues');
    if (rows.length) return;
    for (const issue of ISSUES) {
      await API.post('/api/issues', {
        id: issue.id, date: issue.date, func: issue.func,
        reporter: issue.reporter, description: issue.desc,
        location: issue.location, channel: issue.channel,
        priority: issue.priority, rca_done: issue.rcaDone,
        root_cause: issue.rootCause, action: issue.action,
        assignee: issue.assignee, target: issue.target,
        status: issue.status, progress: issue.progress,
        impact: issue.impact, resources: issue.resources,
        qip: issue.qip, business_impact: issue.businessImpact
      }).catch(() => {}); // ignore duplicate key errors
    }
    console.log('✅ Issues seeded to DB');
  } catch (err) { console.warn('Seed error:', err.message); }
}

// Override submitNewIssue to also save to DB
const _origSubmitNewIssue = typeof submitNewIssue === 'function' ? submitNewIssue : null;
window.submitNewIssue = async function() {
  // Build issue object from form (same logic as original)
  const id = 'DM-' + String(ISSUES.length + 1).padStart(3, '0') + '-' + Date.now().toString(36).slice(-4).toUpperCase();
  const issue = {
    id,
    date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' }).replace(/ /g,'-'),
    func: document.getElementById('ni-func')?.value || '',
    reporter: document.getElementById('ni-reporter')?.value || '',
    description: document.getElementById('ni-desc')?.value || '',
    location: document.getElementById('ni-location')?.value || '',
    channel: document.getElementById('ni-channel')?.value || '',
    priority: document.getElementById('ni-priority')?.value || 'MEDIUM',
    rca_done: false,
    root_cause: document.getElementById('ni-rca')?.value || '',
    action: '',
    assignee: document.getElementById('ni-assignee')?.value || '',
    target: document.getElementById('ni-target')?.value || '',
    status: 'Open',
    progress: 0,
    impact: document.getElementById('ni-impact')?.value || '',
    resources: document.getElementById('ni-resources')?.value || '',
    qip: '',
    business_impact: ''
  };

  if (!issue.description) { showErrorToast('Issue description is required'); return; }

  try {
    await API.post('/api/issues', issue);
    // Add to local array
    ISSUES.unshift({
      ...issue, desc: issue.description, rcaDone: false,
      rootCause: issue.root_cause, businessImpact: issue.business_impact
    });
    if (typeof renderIssueTable === 'function') renderIssueTable();
    if (typeof closeModal === 'function') closeModal('addIssueModal');
    if (typeof showToast === 'function') showToast('✅ Issue ' + id + ' saved to database!');
  } catch (err) {
    showErrorToast('Save failed: ' + err.message);
  }
};

// Auto-save issue changes (progress slider, status dropdowns)
// Debounce helper
function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

const _autoSaveIssue = debounce(async (issueId, fields) => {
  try {
    await API.patch('/api/issues/' + issueId, fields);
  } catch (err) { console.warn('Auto-save issue failed:', err.message); }
}, 800);

// Patch the progress/status update functions
const _origUpdateIssueProgress = typeof updateIssueProgress === 'function' ? updateIssueProgress : null;
window.updateIssueProgress = function(id, val) {
  if (_origUpdateIssueProgress) _origUpdateIssueProgress(id, val);
  const issue = ISSUES.find(i => i.id === id);
  if (issue) { issue.progress = parseInt(val); _autoSaveIssue(id, { progress: parseInt(val) }); }
};

const _origUpdateIssueStatus = typeof updateIssueStatus === 'function' ? updateIssueStatus : null;
window.updateIssueStatus = function(id, val) {
  if (_origUpdateIssueStatus) _origUpdateIssueStatus(id, val);
  const issue = ISSUES.find(i => i.id === id);
  if (issue) { issue.status = val; _autoSaveIssue(id, { status: val }); }
};

// ══════════════════════════════════════════════════════════════
// KPI SCORECARD
// ══════════════════════════════════════════════════════════════

async function loadScorecardFromDB() {
  try {
    const rows = await API.get('/api/kpis/scorecard');
    if (!rows.length) {
      // Seed from hardcoded KPI_SCORECARD
      await API.put('/api/kpis/scorecard', KPI_SCORECARD);
      return;
    }
    // Update KPI_SCORECARD in place
    rows.forEach(r => {
      const idx = KPI_SCORECARD.findIndex(k => k.kpi === r.kpi);
      if (idx >= 0) {
        KPI_SCORECARD[idx].current = r.current_val;
        KPI_SCORECARD[idx].target = r.target;
        KPI_SCORECARD[idx].baseline = r.baseline;
        KPI_SCORECARD[idx].status = r.status;
        KPI_SCORECARD[idx].trend = r.trend;
        KPI_SCORECARD[idx].owner = r.owner;
        KPI_SCORECARD[idx].action = r.action;
      }
    });
  } catch (err) { console.warn('Could not load scorecard:', err.message); }
}

// ══════════════════════════════════════════════════════════════
// DEPARTMENT KPIs
// ══════════════════════════════════════════════════════════════

async function loadDeptKPIsFromDB(key) {
  try {
    const rows = await API.get('/api/kpis/dept/' + key);
    if (!rows.length) return; // keep default data
    _deptKpiStore[key] = rows.map(r => ({
      name: r.name, unit: r.unit, target: r.target, actual: r.actual,
      prev: r.prev, owner: r.owner, freq: r.freq, remarks: r.remarks,
      higher: r.higher
    }));
    if (typeof renderDeptKPITable === 'function') renderDeptKPITable(key);
    if (typeof renderDeptSummaryCards === 'function') renderDeptSummaryCards(key);
    if (typeof renderDeptKPIChart === 'function') renderDeptKPIChart(key);
  } catch (err) { console.warn('Could not load dept KPIs for ' + key + ':', err.message); }
}

// Override saveKPIs to persist dept KPIs
window.saveKPIs = async function(dept) {
  if (dept) {
    try {
      const data = _deptKpiStore[dept] || [];
      await API.put('/api/kpis/dept/' + dept, data);
      if (typeof renderDeptKPITable === 'function') renderDeptKPITable(dept);
      if (typeof renderDeptSummaryCards === 'function') renderDeptSummaryCards(dept);
      if (typeof renderDeptKPIChart === 'function') renderDeptKPIChart(dept);
      if (typeof showToast === 'function') showToast('✅ ' + (DEPT_KPIS_CONFIG[dept]?.label || dept) + ' KPIs saved to database!');
    } catch (err) { showErrorToast('Save failed: ' + err.message); }
  } else {
    // Save all depts
    let allOk = true;
    for (const key of Object.keys(_deptKpiStore || {})) {
      try { await API.put('/api/kpis/dept/' + key, _deptKpiStore[key]); }
      catch (err) { allOk = false; console.warn('Error saving ' + key, err.message); }
    }
    if (typeof showToast === 'function')
      showToast(allOk ? '✅ All KPIs saved to database!' : '⚠️ Some KPIs failed to save');
  }
};

// ══════════════════════════════════════════════════════════════
// CFM REVIEW
// ══════════════════════════════════════════════════════════════

async function loadCFMFromDB() {
  try {
    const council = document.getElementById('cfm-council')?.value || 'Delivery Management';
    const period  = document.getElementById('cfm-month')?.value || '2026-01';
    const data = await API.get('/api/cfm?council=' + encodeURIComponent(council) + '&period=' + period);
    if (!data) return;
    if (data.kpi_data?.length)     window._cfmKpiData      = data.kpi_data;
    if (data.mom_data?.length)     window._cfmMOMData      = data.mom_data;
    if (data.actions_data?.length) window._cfmActionsData  = data.actions_data;
    if (data.achievements?.length) window._cfmAchievements = data.achievements;
    if (data.priorities?.length)   window._cfmPriorities   = data.priorities;
    // Re-render CFM tables if they exist
    if (typeof renderCFMKPITable === 'function')     renderCFMKPITable();
    if (typeof renderCFMMOMTable === 'function')     renderCFMMOMTable();
    if (typeof renderCFMActionsTable === 'function') renderCFMActionsTable();
    if (typeof renderCFMAchievements === 'function') renderCFMAchievements();
    if (typeof renderCFMPriorities === 'function')   renderCFMPriorities();
    if (typeof updateCFMStatBanner === 'function')   updateCFMStatBanner();
  } catch (err) { console.warn('Could not load CFM data:', err.message); }
}

// Override saveCFMReview
window.saveCFMReview = async function() {
  try {
    const council = document.getElementById('cfm-council')?.value || 'Delivery Management';
    const period  = document.getElementById('cfm-month')?.value || '2026-01';
    await API.put('/api/cfm', {
      council, period,
      kpi_data:     window._cfmKpiData     || CFM_KPI_DEFAULTS     || [],
      mom_data:     window._cfmMOMData     || CFM_MOM_DEFAULTS      || [],
      actions_data: window._cfmActionsData || CFM_ACTIONS_DEFAULTS  || [],
      achievements: window._cfmAchievements || [],
      priorities:   window._cfmPriorities   || []
    });
    if (typeof updateCFMStatBanner === 'function') updateCFMStatBanner();
    if (typeof showToast === 'function') showToast('✅ CFM Review saved to database!');
  } catch (err) { showErrorToast('CFM save failed: ' + err.message); }
};

// ══════════════════════════════════════════════════════════════
// TUBE & FLAP
// ══════════════════════════════════════════════════════════════

window.saveTubeFlap = async function() {
  try {
    // Collect all tube/flap form values
    const data = {};
    document.querySelectorAll('[id^="tf-"]').forEach(el => { data[el.id] = el.value; });
    await API.put('/api/settings/tube-flap', data);
    if (typeof showToast === 'function') showToast('✅ Tube & Flap schedule saved to database!');
  } catch (err) { showErrorToast('Save failed: ' + err.message); }
};

async function loadTubeFlapFromDB() {
  try {
    const data = await API.get('/api/settings/tube-flap');
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
  } catch (err) { console.warn('Could not load tube flap data:', err.message); }
}

// ══════════════════════════════════════════════════════════════
// OE CONFIG
// ══════════════════════════════════════════════════════════════

window.saveOEConfig = async function() {
  try {
    const freq = document.getElementById('oe-sync-freq')?.value || '4h';
    const data = { freq };
    document.querySelectorAll('[id^="oe-"]').forEach(el => { data[el.id] = el.value; });
    await API.put('/api/settings/oe-config', data);
    if (typeof showToast === 'function') showToast(`✅ OE10→FG10 config saved to database!`);
  } catch (err) { showErrorToast('Save failed: ' + err.message); }
};

async function loadOEConfigFromDB() {
  try {
    const data = await API.get('/api/settings/oe-config');
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    });
  } catch (err) { console.warn('Could not load OE config:', err.message); }
}

// ══════════════════════════════════════════════════════════════
// FILE UPLOAD — Replace simulated upload with real upload
// ══════════════════════════════════════════════════════════════

const _origHandleFiles = window.handleFiles;
window.handleFiles = async function(files, category) {
  // Still show the UI progress animation (call original)
  if (_origHandleFiles) _origHandleFiles(files, category);

  // Also actually upload to server
  const formData = new FormData();
  Array.from(files).forEach(f => formData.append('files', f));
  formData.append('category', category || 'General');

  try {
    const r = await fetch('/api/settings/upload', { method: 'POST', body: formData });
    if (r.ok) {
      const result = await r.json();
      console.log('✅ Files stored on server:', result.files.map(f => f.name).join(', '));
    }
  } catch (err) { console.warn('Server upload failed:', err.message); }
};

// ══════════════════════════════════════════════════════════════
// INIT — Load all data when page is ready
// ══════════════════════════════════════════════════════════════

async function initAPIData() {
  console.log('🔄 Loading data from database...');
  try {
    // Seed issues first (if DB is empty), then load
    await seedIssuesIfEmpty();
    await loadIssuesFromDB();
    await loadScorecardFromDB();

    // Load all dept KPIs
    const depts = Object.keys(typeof DEPT_KPIS_CONFIG !== 'undefined' ? DEPT_KPIS_CONFIG : {});
    for (const dept of depts) {
      await loadDeptKPIsFromDB(dept);
    }

    // Load settings
    await loadTubeFlapFromDB();
    await loadOEConfigFromDB();

    console.log('✅ All data loaded from database');
  } catch (err) {
    console.warn('Init load error (using default data):', err.message);
  }
}

// Wait for page scripts to finish, then init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initAPIData, 200));
} else {
  setTimeout(initAPIData, 200);
}

// Also hook into section switches to lazy-load CFM data
const _origShowSection = typeof showSection === 'function' ? showSection : null;
window.showSection = function(id, el) {
  if (_origShowSection) _origShowSection(id, el);
  if (id === 'cfm') setTimeout(loadCFMFromDB, 100);
};

console.log('✅ JK Tyre API client loaded');
