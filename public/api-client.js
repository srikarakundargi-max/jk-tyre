/**
 * JK Tyre API Client v5
 * - Seeds all 47 issues + 19 QIPs to DB (ON CONFLICT DO NOTHING)
 * - Loads from DB every page load
 * - refreshAllViews() recomputes EVERY hardcoded count/chart from live data
 */

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

function toast(msg, color) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.style.background = color || '';
  t.classList.add('show');
  setTimeout(() => { t.classList.remove('show'); t.style.background = ''; }, 3500);
}
const toastOK  = msg => toast('✅ ' + msg, '#2E7D32');
const toastErr = msg => toast('❌ ' + msg, '#C62828');

function rowToIssue(r) {
  return {
    id: r.id, date: r.date, func: r.func, reporter: r.reporter,
    desc: r.description,
    location: r.location, channel: r.channel, priority: r.priority,
    rcaDone: r.rca_done, rootCause: r.root_cause,
    action: r.action, assignee: r.assignee, target: r.target,
    status: r.status, progress: r.progress,
    impact: r.impact, resources: r.resources,
    qip: r.qip, businessImpact: r.business_impact
  };
}

function rowToQIP(r) {
  return {
    id: r.id, title: r.title, phase: r.phase, owner: r.owner,
    target: r.target, status: r.status, progress: r.progress,
    channel: r.channel, priority: r.priority,
    objective: r.objective, expectedOutcome: r.expected_outcome,
    issues: Array.isArray(r.issues) ? r.issues : []
  };
}

// ══════════════════════════════════════════════════════════════
// REFRESH ALL VIEWS — recomputes every count/chart from live data
// ══════════════════════════════════════════════════════════════
const _dashChartInstances = {};

function refreshAllViews() {
  const total   = ISSUES.length;
  const qTotal  = QIPS.length;
  const rcaDone = ISSUES.filter(i => i.rcaDone).length;
  const rcaPct  = total > 0 ? Math.round(rcaDone / total * 100) : 0;
  const open    = ISSUES.filter(i => i.status === 'Open').length;
  const inProg  = ISSUES.filter(i => i.status === 'In Progress').length;

  // 1. Nav badge — Issue Register
  const navBadge = document.querySelector('.nav-item[onclick*="issues"] .nav-badge');
  if (navBadge) navBadge.textContent = total;

  // 2. Nav badge — QIPs
  const qipBadge = document.querySelector('.nav-item[onclick*="qip"] .nav-badge');
  if (qipBadge) qipBadge.textContent = qTotal;

  // 3. Dashboard banner stats (the 4 numbers at the top)
  const statVals = document.querySelectorAll('#section-dashboard .cft-stat .val');
  if (statVals.length >= 3) {
    statVals[0].textContent = total;     // Total Issues
    statVals[1].textContent = qTotal;    // QIPs Active
    statVals[2].textContent = rcaPct + '%'; // RCA Done
    // statVals[3] = OTIF — leave as is (KPI data)
  }

  // 4. Issue Register header — "All 47 Issues"
  const issHeader = document.querySelector('#section-issues .section-header h2');
  if (issHeader) issHeader.textContent = `Issue Register — All ${total} Issues`;

  // 5. Topbar issue count
  const issCount = document.getElementById('issue-count');
  if (issCount) issCount.textContent = total + ' issues';

  // 6. Top-issues table on dashboard (critical & high)
  const topBody = document.getElementById('top-issues-body');
  if (topBody) {
    const critHigh = ISSUES.filter(i => i.priority === 'CRITICAL' || i.priority === 'HIGH').slice(0, 10);
    topBody.innerHTML = critHigh.map(i => `
      <tr onclick="showIssueDetail('${i.id}')" style="cursor:pointer;">
        <td><strong>${i.id}</strong></td>
        <td>${(i.desc||'').substring(0,55)}...</td>
        <td>${i.func}</td>
        <td>${i.channel}</td>
        <td><span class="badge ${i.priority==='CRITICAL'?'critical':i.priority==='HIGH'?'red':i.priority==='MEDIUM'?'yellow':'green'}">${i.priority}</span></td>
        <td><span class="badge ${i.rcaDone?'green':'gray'}">${i.rcaDone?'Done':'Pending'}</span></td>
        <td><span class="badge ${(typeof statusColor==='function'?statusColor(i.status):'blue')}">${i.status||'Open'}</span></td>
        <td><button class="btn btn-secondary" onclick="event.stopPropagation();showIssueDetail('${i.id}')">View</button></td>
      </tr>`).join('');
  }

  // 7. Rebuild dashboard charts from live ISSUES data
  _rebuildDashCharts();

  // 8. Refresh QIP table
  if (typeof populateQIPs === 'function') populateQIPs(QIPS);

  // 9. Issue table
  if (typeof populateIssueTable === 'function') populateIssueTable(ISSUES);

  console.log('[DB] refreshAllViews — issues:', total, '| qips:', qTotal, '| rca:', rcaPct + '%');
}

function _rebuildDashCharts() {
  // Count by function
  const byFunc = {};
  ISSUES.forEach(i => { byFunc[i.func] = (byFunc[i.func]||0) + 1; });

  // Count by status
  const open    = ISSUES.filter(i => i.status==='Open').length;
  const inProg  = ISSUES.filter(i => i.status==='In Progress').length;
  const onHold  = ISSUES.filter(i => i.status==='On Hold').length;
  const done    = ISSUES.filter(i => i.status==='Completed').length;

  // Count by priority
  const critical = ISSUES.filter(i => i.priority==='CRITICAL').length;
  const high     = ISSUES.filter(i => i.priority==='HIGH').length;
  const medium   = ISSUES.filter(i => i.priority==='MEDIUM').length;
  const low      = ISSUES.filter(i => i.priority==='LOW').length;

  // Count by channel
  const byChannel = {};
  ISSUES.forEach(i => {
    const ch = (i.channel||'Other').split(',')[0].trim();
    byChannel[ch] = (byChannel[ch]||0) + 1;
  });

  const colors = ['#1565C0','#E8A020','#2E7D32','#C62828','#6A1B9A','#00838F','#AD1457','#37474F'];

  // Helper: destroy old chart instance and create new
  function remake(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (_dashChartInstances[id]) { _dashChartInstances[id].destroy(); delete _dashChartInstances[id]; }
    try { _dashChartInstances[id] = new Chart(canvas, config); } catch(e) {}
  }

  // funcChart — bar chart by function
  const funcLabels = Object.keys(byFunc);
  const funcData   = funcLabels.map(k => byFunc[k]);
  remake('funcChart', {
    type: 'bar',
    data: { labels: funcLabels, datasets: [{ label:'Issues', data: funcData, backgroundColor: colors, borderRadius: 4 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { ticks: { font: { size: 10 } } } }, indexAxis: 'y' }
  });

  // statusChart — doughnut
  remake('statusChart', {
    type: 'doughnut',
    data: {
      labels: ['Open','In Progress','On Hold','Completed'],
      datasets: [{ data: [open, inProg, onHold, done], backgroundColor: ['#C62828','#E8A020','#6A1B9A','#2E7D32'], borderWidth: 2 }]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, cutout: '60%' }
  });

  // priorityChart — doughnut
  remake('priorityChart', {
    type: 'doughnut',
    data: {
      labels: ['Critical','High','Medium','Low'],
      datasets: [{ data: [critical, high, medium, low], backgroundColor: ['#880E4F','#C62828','#E8A020','#2E7D32'], borderWidth: 2 }]
    },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, cutout: '60%' }
  });

  // channelChart — doughnut
  const chLabels = Object.keys(byChannel);
  const chData   = chLabels.map(k => byChannel[k]);
  remake('channelChart', {
    type: 'doughnut',
    data: { labels: chLabels, datasets: [{ data: chData, backgroundColor: colors, borderWidth: 2 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, cutout: '65%' }
  });

  // catChart stays as-is (category is not in issue data directly, keep static)
}

// ══════════════════════════════════════════════════════════════
// SEED + LOAD ISSUES
// ══════════════════════════════════════════════════════════════
async function seedAndLoadIssues() {
  try {
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

    const seed = await API.post('/api/issues/bulk-seed', payload);
    if (seed.seeded > 0) console.log('[DB] Seeded', seed.seeded, 'new issues');

    const rows = await API.get('/api/issues');
    ISSUES.length = 0;
    rows.forEach(r => ISSUES.push(rowToIssue(r)));
    console.log('[DB] Issues loaded:', rows.length);
  } catch(e) {
    console.error('[DB] seedAndLoadIssues failed:', e.message);
    toastErr('DB error loading issues: ' + e.message);
  }
}

// ══════════════════════════════════════════════════════════════
// SEED + LOAD QIPs
// ══════════════════════════════════════════════════════════════
async function seedAndLoadQIPs() {
  try {
    const payload = QIPS.map(q => ({
      id: q.id, title: q.title, phase: q.phase, owner: q.owner,
      target: q.target, status: q.status || 'In Progress',
      progress: q.progress || 0, channel: q.channel,
      priority: q.priority || 'HIGH', objective: q.objective || '',
      expectedOutcome: q.expectedOutcome || '', issues: q.issues || []
    }));

    const seed = await API.post('/api/qips/bulk-seed', payload);
    if (seed.seeded > 0) console.log('[DB] Seeded', seed.seeded, 'new QIPs');

    const rows = await API.get('/api/qips');
    QIPS.length = 0;
    rows.forEach(r => QIPS.push(rowToQIP(r)));
    console.log('[DB] QIPs loaded:', rows.length);
  } catch(e) {
    console.error('[DB] seedAndLoadQIPs failed:', e.message);
  }
}

// ══════════════════════════════════════════════════════════════
// SUBMIT NEW ISSUE
// ══════════════════════════════════════════════════════════════
window.submitNewIssue = async function() {
  const desc = document.getElementById('ni-desc')?.value?.trim();
  if (!desc) { alert('Please enter issue description'); return; }

  const maxNum = ISSUES.reduce((mx, i) => { const n = parseInt(i.id.replace('DM-','')) || 0; return n > mx ? n : mx; }, 0);
  const newId  = 'DM-' + String(maxNum + 1).padStart(3, '0');

  const newIssue = {
    id: newId,
    date: new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'2-digit' }),
    func:      document.getElementById('ni-func')?.value      || '',
    reporter:  document.getElementById('ni-reporter')?.value  || 'Anonymous',
    desc,
    location:  document.getElementById('ni-location')?.value  || 'TBD',
    channel:   document.getElementById('ni-channel')?.value   || '',
    priority:  document.getElementById('ni-priority')?.value  || 'MEDIUM',
    rcaDone: false, rootCause: document.getElementById('ni-rca')?.value || '',
    action: '', assignee: document.getElementById('ni-assignee')?.value || '',
    target:    document.getElementById('ni-target')?.value    || '',
    status: 'Open', progress: 0,
    impact:    document.getElementById('ni-impact')?.value    || 'Under assessment',
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
    if (typeof closeModal === 'function') closeModal('addIssueModal');

    // Refresh EVERY view that shows issue counts
    refreshAllViews();
    toastOK('Issue ' + newIssue.id + ' saved! Total: ' + ISSUES.length + ' issues');
  } catch(err) {
    toastErr('Save failed: ' + err.message);
  }
};

// ══════════════════════════════════════════════════════════════
// DEPT KPIs
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
      if (typeof renderDeptKPITable    === 'function') renderDeptKPITable(key);
      if (typeof renderDeptSummaryCards === 'function') renderDeptSummaryCards(key);
      if (typeof renderDeptKPIChart    === 'function') renderDeptKPIChart(key);
    }
  } catch(e) { console.warn('[DB] loadDeptKPIs', key, ':', e.message); }
}

window.saveKPIs = async function(dept) {
  if (!dept) {
    const keys = typeof DEPT_KPIS_CONFIG !== 'undefined' ? Object.keys(DEPT_KPIS_CONFIG) : [];
    for (const k of keys) {
      try { await API.put('/api/kpis/dept/' + k, (typeof _deptKpiStore !== 'undefined' ? _deptKpiStore[k] : []) || []); }
      catch(e) { console.warn('[DB] saveKPIs', k, e.message); }
    }
    toastOK('All KPIs saved!');
    return;
  }
  try {
    await API.put('/api/kpis/dept/' + dept, (typeof _deptKpiStore !== 'undefined' ? _deptKpiStore[dept] : []) || []);
    if (typeof renderDeptKPITable    === 'function') renderDeptKPITable(dept);
    if (typeof renderDeptSummaryCards === 'function') renderDeptSummaryCards(dept);
    if (typeof renderDeptKPIChart    === 'function') renderDeptKPIChart(dept);
    const label = typeof DEPT_KPIS_CONFIG !== 'undefined' ? (DEPT_KPIS_CONFIG[dept]?.label || dept) : dept;
    toastOK(label + ' KPIs saved!');
  } catch(e) { toastErr('KPI save failed: ' + e.message); }
};

// ══════════════════════════════════════════════════════════════
// CFM REVIEW
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
    ['renderCFMKPITable','renderCFMMOMTable','renderCFMActionsTable',
     'renderCFMAchievements','renderCFMPriorities','updateCFMStatBanner']
      .forEach(fn => { if (typeof window[fn] === 'function') window[fn](); });
  } catch(e) { console.warn('[DB] loadCFMReview:', e.message); }
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
// SETTINGS
// ══════════════════════════════════════════════════════════════
window.saveTubeFlap = async function() {
  try {
    const data = {};
    document.querySelectorAll('[id^="tf-"]').forEach(el => { if (el.value !== undefined) data[el.id] = el.value; });
    await API.put('/api/settings/tube-flap', data);
    toastOK('Tube & Flap schedule saved!');
  } catch(e) { toastErr('Save failed: ' + e.message); }
};

window.saveOEConfig = async function() {
  try {
    const data = {};
    document.querySelectorAll('[id^="oe-"]').forEach(el => { if (el.value !== undefined) data[el.id] = el.value; });
    await API.put('/api/settings/oe-config', data);
    toastOK('OE Config saved!');
  } catch(e) { toastErr('Save failed: ' + e.message); }
};

async function loadSettings(key) {
  try {
    const data = await API.get('/api/settings/' + key);
    Object.entries(data).forEach(([id, val]) => { const el = document.getElementById(id); if (el) el.value = val; });
  } catch(e) { console.warn('[DB] loadSettings', key, ':', e.message); }
}

// ══════════════════════════════════════════════════════════════
// FILE UPLOAD
// ══════════════════════════════════════════════════════════════
const _origHandleFiles = window.handleFiles;
window.handleFiles = async function(files, category) {
  if (_origHandleFiles) _origHandleFiles(files, category);
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('files', f));
  fd.append('category', category || 'General');
  try { await fetch('/api/upload', { method: 'POST', body: fd }); }
  catch(e) { console.warn('[DB] Upload failed:', e.message); }
};

// ══════════════════════════════════════════════════════════════
// SECTION SWITCH HOOK
// ══════════════════════════════════════════════════════════════
const _origShowSection = window.showSection;
window.showSection = function(id, el) {
  if (_origShowSection) _origShowSection(id, el);
  if (id === 'cfm_review') setTimeout(loadCFMReview, 150);
};

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
async function initFromDB() {
  try { await API.get('/api/health'); }
  catch(e) { toastErr('Cannot reach server'); return; }

  await Promise.all([ seedAndLoadIssues(), seedAndLoadQIPs() ]);

  // Refresh ALL views with live data from DB
  refreshAllViews();

  await loadSettings('tube-flap');
  await loadSettings('oe-config');

  if (typeof DEPT_KPIS_CONFIG !== 'undefined') {
    for (const k of Object.keys(DEPT_KPIS_CONFIG)) await loadDeptKPIs(k);
  }

  console.log('[DB] ✅ Init complete — issues:', ISSUES.length, '| QIPs:', QIPS.length);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(initFromDB, 500));
} else {
  setTimeout(initFromDB, 500);
}

console.log('[DB] api-client.js v5 loaded');

// ══════════════════════════════════════════════════════════════
// REAL runAnalysis — replaces the fake placeholder
// ══════════════════════════════════════════════════════════════

// Track server-side file IDs after real upload
window._serverFileIds = [];

// Override handleFiles to capture the server file IDs
const _origHandleFiles2 = window.handleFiles;
window.handleFiles = async function(files, category) {
  // Run the original UI animation
  if (_origHandleFiles2) _origHandleFiles2(files, category);

  // Upload to server and capture returned IDs
  const fd = new FormData();
  Array.from(files).forEach(f => fd.append('files', f));
  fd.append('category', category || 'General');

  try {
    const r   = await fetch('/api/upload', { method: 'POST', body: fd });
    const res = await r.json();
    if (res.files?.length) {
      res.files.forEach(f => window._serverFileIds.push(f.id));
      console.log('[Upload] Stored on server:', res.files.map(f => f.name).join(', '));
    }
  } catch(e) { console.warn('[Upload] Server upload failed:', e.message); }
};

// Override runAnalysis with real implementation
window.runAnalysis = async function() {
  const ready = (typeof uploadedFiles !== 'undefined') ? uploadedFiles.filter(f => f.status === 'ready') : [];
  if (!ready.length) return;

  if (typeof showUploadToast === 'function')
    showUploadToast('🚀 Parsing ' + ready.length + ' file(s)...', '#1565C0');

  // Get selected analysis modules from the UI
  const modules = [];
  if (document.getElementById('map-kpi')?.classList.contains('selected'))     modules.push('kpi');
  if (document.getElementById('map-issues')?.classList.contains('selected'))  modules.push('issues');
  if (document.getElementById('map-qip')?.classList.contains('selected'))     modules.push('qips');

  try {
    const res = await fetch('/api/upload/analyse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: window._serverFileIds, modules })
    });
    const result = await res.json();

    if (!res.ok) throw new Error(result.error || 'Analysis failed');

    const parts = [];
    if (result.kpi     > 0) parts.push(result.kpi + ' KPIs updated');
    if (result.issues  > 0) parts.push(result.issues + ' issues imported');
    if (result.qips    > 0) parts.push(result.qips + ' QIPs updated');
    if (result.errors?.length) console.warn('[Upload] Warnings:', result.errors);

    const msg = parts.length
      ? '✅ ' + parts.join(' · ') + ' — dashboard refreshing...'
      : '⚠️ No matching data found. Check file format (see Data Format Guide).';

    if (typeof showUploadToast === 'function') showUploadToast(msg, parts.length ? '#2E7D32' : '#E8A020');

    if (parts.length) {
      // Reload data and refresh all views
      await Promise.all([ seedAndLoadIssues(), seedAndLoadQIPs() ]);
      refreshAllViews();
      // Reload KPI scorecard from DB
      try {
        const kpiRows = (await API.get('/api/kpis/scorecard')).catch(() => []);
        console.log('[DB] KPI scorecard refreshed after upload');
      } catch(e) {}
    }
  } catch(e) {
    if (typeof showUploadToast === 'function') showUploadToast('❌ Analysis failed: ' + e.message, '#C62828');
    console.error('[Upload] Analysis error:', e);
  }
};

// ══════════════════════════════════════════════════════════════
// DELETE ISSUE FUNCTIONALITY
// ══════════════════════════════════════════════════════════════

// Delete a single issue from DB + array + all views
window.deleteIssue = async function(id, fromModal) {
  const issue = ISSUES.find(i => i.id === id);
  if (!issue) return;

  const confirmed = confirm(
    `Delete issue ${id}?\n\n"${(issue.desc||'').substring(0, 80)}"\n\nThis cannot be undone.`
  );
  if (!confirmed) return;

  try {
    const r = await fetch('/api/issues/' + id, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());

    // Remove from in-memory array
    const idx = ISSUES.findIndex(i => i.id === id);
    if (idx >= 0) ISSUES.splice(idx, 1);

    // Close modal if delete was triggered from inside it
    if (fromModal && typeof closeModal === 'function') closeModal('issueModal');

    // Refresh all counts + charts + tables
    refreshAllViews();
    toastOK('Issue ' + id + ' deleted. ' + ISSUES.length + ' issues remaining.');
  } catch(e) {
    toastErr('Delete failed: ' + e.message);
  }
};

// Bulk delete selected issues
window._selectedForDelete = new Set();

window.toggleIssueSelect = function(id, checkbox) {
  if (checkbox.checked) {
    window._selectedForDelete.add(id);
  } else {
    window._selectedForDelete.delete(id);
  }
  const btn = document.getElementById('bulk-delete-btn');
  if (btn) {
    const n = window._selectedForDelete.size;
    btn.style.display = n > 0 ? 'inline-flex' : 'none';
    btn.textContent = '🗑 Delete Selected (' + n + ')';
  }
};

window.bulkDeleteIssues = async function() {
  const ids = [...window._selectedForDelete];
  if (!ids.length) return;
  const confirmed = confirm(`Delete ${ids.length} selected issue(s)?\n\n${ids.join(', ')}\n\nThis cannot be undone.`);
  if (!confirmed) return;

  let deleted = 0;
  for (const id of ids) {
    try {
      await fetch('/api/issues/' + id, { method: 'DELETE' });
      const idx = ISSUES.findIndex(i => i.id === id);
      if (idx >= 0) { ISSUES.splice(idx, 1); deleted++; }
    } catch(e) { console.warn('Delete failed for', id, e.message); }
  }

  window._selectedForDelete.clear();
  refreshAllViews();
  toastOK(deleted + ' issue(s) deleted. ' + ISSUES.length + ' remaining.');
};

// ── Override populateIssueTable to add checkboxes + delete buttons ──
window.populateIssueTable = function(data) {
  document.getElementById('issue-count').textContent = data.length + ' issues';

  // Inject bulk-delete button above table if not already there
  let bulkBtn = document.getElementById('bulk-delete-btn');
  if (!bulkBtn) {
    const header = document.querySelector('#section-issues .section-header') ||
                   document.querySelector('#section-issues .table-card-header');
    if (header) {
      bulkBtn = document.createElement('button');
      bulkBtn.id = 'bulk-delete-btn';
      bulkBtn.onclick = bulkDeleteIssues;
      bulkBtn.style.cssText = `
        display:none; align-items:center; gap:6px;
        background:#C62828; color:#fff; border:none;
        padding:7px 16px; border-radius:6px; cursor:pointer;
        font-size:13px; font-weight:600; margin-left:12px;`;
      header.appendChild(bulkBtn);
    }
  }

  // Inject Select All checkbox into the table header if not there
  const thead = document.querySelector('#section-issues thead tr');
  if (thead && !thead.querySelector('.select-all-th')) {
    const th = document.createElement('th');
    th.className = 'select-all-th';
    th.style.width = '32px';
    th.innerHTML = '<input type="checkbox" title="Select all" onchange="document.querySelectorAll(\'.issue-row-check\').forEach(cb => { cb.checked = this.checked; toggleIssueSelect(cb.dataset.id, cb); })">';
    thead.insertBefore(th, thead.firstChild);

    // Also add delete column header
    const thDel = document.createElement('th');
    thDel.textContent = 'Actions';
    thead.appendChild(thDel);
  }

  document.getElementById('issue-tbody').innerHTML = data.map(i => `
    <tr onclick="showIssueDetail('${i.id}')" style="cursor:pointer;">
      <td onclick="event.stopPropagation()">
        <input type="checkbox" class="issue-row-check" data-id="${i.id}"
          onchange="toggleIssueSelect('${i.id}', this)"
          style="width:15px;height:15px;cursor:pointer;">
      </td>
      <td><strong>${i.id}</strong></td>
      <td style="font-size:11px;">${i.date}</td>
      <td>${i.func}</td>
      <td style="font-size:11px;">${i.reporter}</td>
      <td style="max-width:220px;">${(i.desc||'').substring(0,70)}...</td>
      <td style="font-size:11px;">${i.location||'—'}</td>
      <td><span class="badge blue">${i.channel}</span></td>
      <td><span class="badge ${i.priority==='CRITICAL'?'critical':i.priority==='HIGH'?'red':i.priority==='MEDIUM'?'yellow':'green'}">${i.priority||'—'}</span></td>
      <td><span class="badge ${i.rcaDone?'green':'gray'}">${i.rcaDone?'✓':'Pending'}</span></td>
      <td><span class="badge ${(typeof statusColor==='function'?statusColor(i.status||'Open'):'blue')}">${i.status||'Open'}</span></td>
      <td>
        <div class="progress-bar" style="width:80px;">
          <div class="progress-fill ${(i.progress||0)>=70?'green':(i.progress||0)>=30?'yellow':'red'}" style="width:${i.progress||0}%;"></div>
        </div>
        <span style="font-size:10px;">${i.progress||0}%</span>
      </td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;">
        <button class="btn btn-secondary" onclick="showIssueDetail('${i.id}')" style="margin-right:4px;">Detail</button>
        <button onclick="deleteIssue('${i.id}')"
          style="background:#C62828;color:#fff;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">
          🗑
        </button>
      </td>
    </tr>`).join('');
};

// ── Add delete button inside the issue detail modal ────────────
const _origShowIssueDetail = window.showIssueDetail;
window.showIssueDetail = function(id) {
  if (_origShowIssueDetail) _origShowIssueDetail(id);

  // Inject Delete button into modal footer after a tick
  setTimeout(() => {
    const modal = document.getElementById('issueModal');
    if (!modal) return;

    // Don't add twice
    if (modal.querySelector('.modal-delete-btn')) return;

    const footer = modal.querySelector('.modal-footer') || modal.querySelector('.modal-actions');
    const target = footer || modal.querySelector('.modal-content');
    if (!target) return;

    const btn = document.createElement('button');
    btn.className = 'modal-delete-btn';
    btn.innerHTML = '🗑 Delete This Issue';
    btn.style.cssText = `
      background:#C62828; color:#fff; border:none;
      padding:8px 20px; border-radius:6px; cursor:pointer;
      font-size:13px; font-weight:600; margin-top:16px;`;
    btn.onclick = () => deleteIssue(id, true);

    // Remove old delete btn if switching issues
    target.querySelectorAll('.modal-delete-btn').forEach(b => b.remove());
    target.appendChild(btn);
  }, 50);
};

console.log('[DB] Delete functionality loaded ✅');
