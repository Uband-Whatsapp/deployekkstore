(function () {
'use strict';

const ADMIN_PASSWORD = 'ekkadmin2024';
const SESSION_KEY = 'ekk_admin_session_v1';
const SESSION_DURATION = 12 * 60 * 60 * 1000;
const CLOUDINARY_CLOUD_NAME = 'uuvl0m4s';
const CLOUDINARY_UPLOAD_PRESET = 'Deploy-EkkStore';

let currentPage = 'dashboard';
let uploadedImageUrl = '';
let currentDeployDays = 0;
let currentStatsDays = 0;

function $(id) { return document.getElementById(id); }

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function relativeTime(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return m + ' menit lalu';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' jam lalu';
  const d = Math.floor(h / 24);
  return d + ' hari lalu';
}

function toast(msg, type) {
  const el = $('toast');
  if (!el) return;
  let icon = '<i class="fa-solid fa-circle-info" style="color:var(--accent);"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:var(--success);"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger);"></i>';
  el.innerHTML = icon + ' ' + escapeHTML(msg);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function isLoggedIn() {
  try {
    const d = localStorage.getItem(SESSION_KEY);
    if (!d) return false;
    const p = JSON.parse(d);
    return p.expiresAt && Date.now() < p.expiresAt;
  } catch (e) { return false; }
}

function setLoggedIn() {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ expiresAt: Date.now() + SESSION_DURATION })); } catch (e) {}
}

function clearLogin() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

function showLogin() {
  $('login-screen').classList.remove('hidden');
  $('admin-app').classList.remove('visible');
}

function showApp() {
  $('login-screen').classList.add('hidden');
  $('admin-app').classList.add('visible');
  route();
}

function getPageFromHash() {
  const h = (window.location.hash || '').replace('#', '');
  if (h === 'notif') return 'notif';
  if (h === 'deploy') return 'deploy';
  if (h === 'pengunjung') return 'pengunjung';
  if (h === 'apk') return 'apk';
  return 'dashboard';
}

function setActiveNav(page) {
  document.querySelectorAll('.sidebar-link').forEach(a => {
    a.classList.toggle('active', a.dataset.nav === page);
  });
}

function route() {
  currentPage = getPageFromHash();
  setActiveNav(currentPage);
  closeSidebar();

  const content = $('admin-content');
  if (!content) return;
  content.innerHTML = '<div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>';

  if (currentPage === 'dashboard') renderDashboard(content);
  else if (currentPage === 'notif') renderNotif(content);
  else if (currentPage === 'deploy') renderDeploy(content);
  else if (currentPage === 'pengunjung') renderPengunjung(content);
  else if (currentPage === 'apk') renderApk(content);
}

function openSidebar() {
  $('admin-sidebar')?.classList.add('open');
  $('admin-sidebar-backdrop')?.classList.add('active');
}
function closeSidebar() {
  $('admin-sidebar')?.classList.remove('open');
  $('admin-sidebar-backdrop')?.classList.remove('active');
}

async function fetchStats(days) {
  const url = '/api/send-notification?action=stats' + (days > 0 ? '&days=' + days : '');
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.json();
}

async function fetchDeployStats(days, mode) {
  let url = '/api/update-status?action=deploy-stats';
  if (days > 0) url += '&days=' + days;
  if (mode) url += '&mode=' + mode;
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.json();
}

// ============================================================
// DASHBOARD
// ============================================================
async function renderDashboard(content) {
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-icon"><i class="fa-solid fa-chart-line"></i></div>
      <div class="page-header-text">
        <h1>Dashboard <span class="tag">Overview</span></h1>
        <p>Ringkasan aktivitas platform Ekk Store.</p>
      </div>
    </div>
    <div class="stat-grid" id="dash-stats">
      <div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>
    </div>
    <div class="card-x">
      <h3><i class="fa-solid fa-rocket"></i> Deploy Terbaru</h3>
      <div id="dash-deploy-list"><div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div></div>
    </div>
  `;

  try {
    const [stats, deploy] = await Promise.all([fetchStats(0), fetchDeployStats(0, 'summary')]);
    const g = deploy.global || {};

    $('dash-stats').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon orange"><i class="fa-solid fa-users"></i></div>
        <div class="stat-info"><span class="stat-value">${stats.pengunjung?.total || 0}</span><span class="stat-label">Total Pengunjung</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"><i class="fa-solid fa-circle-check"></i></div>
        <div class="stat-info"><span class="stat-value">${g.success || 0}</span><span class="stat-label">Deploy Sukses</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><i class="fa-solid fa-circle-xmark"></i></div>
        <div class="stat-info"><span class="stat-value">${g.failed || 0}</span><span class="stat-label">Deploy Gagal</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><i class="fa-solid fa-bell"></i></div>
        <div class="stat-info"><span class="stat-value">${stats.subscriber || 0}</span><span class="stat-label">Subscriber Notif</span></div>
      </div>
    `;

    const recent = deploy.recent || [];
    if (recent.length === 0) {
      $('dash-deploy-list').innerHTML = '<div class="empty"><i class="fa-solid fa-inbox"></i><p>Belum ada deploy</p></div>';
    } else {
      $('dash-deploy-list').innerHTML = recent.map(p => renderDeployRow(p, true)).join('');
    }
  } catch (e) {
    $('dash-stats').innerHTML = '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Gagal memuat: ' + escapeHTML(e.message) + '</p></div>';
    $('dash-deploy-list').innerHTML = '';
  }
}

function renderDeployRow(p, showUser) {
  let badge = 'info';
  let label = p.status;
  if (p.status === 'success') { badge = 'success'; label = 'Berhasil'; }
  else if (p.status === 'failed') { badge = 'failed'; label = 'Gagal'; }
  else if (p.status === 'proses') { badge = 'proses'; label = 'Proses'; }

  const urlHtml = p.url
    ? `<a class="detail-link" href="${escapeHTML(p.url)}" target="_blank" rel="noopener"><i class="fa-solid fa-link"></i> ${escapeHTML(p.url)}</a>`
    : '<span style="color:#52525e;">—</span>';

  const userHtml = showUser
    ? `<span style="color:${p.has_profile ? '#f97316' : '#78788a'}; font-weight:600;"><i class="fa-solid fa-user" style="font-size:9px;"></i> ${escapeHTML(p.username)}</span>`
    : '';

  return `
    <div class="list-row">
      <div class="list-avatar"><i class="fa-solid fa-rocket"></i></div>
      <div class="list-info">
        <div class="list-name">${escapeHTML(p.projectName || '(tanpa nama)')}</div>
        <div class="list-meta">
          ${userHtml}
          <span><i class="fa-regular fa-clock"></i> ${relativeTime(p.createdAt)}</span>
        </div>
        <div class="list-meta" style="margin-top:2px;">${urlHtml}</div>
      </div>
      <div class="list-actions">
        <span class="badge ${badge}">${label}</span>
      </div>
    </div>
  `;
}

// ============================================================
// NOTIF
// ============================================================
function renderNotif(content) {
  uploadedImageUrl = '';
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-icon"><i class="fa-solid fa-paper-plane"></i></div>
      <div class="page-header-text">
        <h1>Kirim Notif <span class="tag">Broadcast</span></h1>
        <p>Isi konten, lihat preview, lalu kirim ke semua subscriber.</p>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon blue"><i class="fa-solid fa-bell"></i></div>
        <div class="stat-info"><span class="stat-value" id="nf-sub">—</span><span class="stat-label">Subscriber</span></div>
      </div>
    </div>
    <div class="card-x">
      <div class="form-group">
        <label class="form-label" for="nf-title"><i class="fa-solid fa-heading"></i> Judul Notifikasi</label>
        <input type="text" id="nf-title" class="form-input" placeholder="contoh: Ekk Store Update" maxlength="60">
        <span class="form-hint"><span class="counter" id="nf-title-c">0</span> / 60</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="nf-body"><i class="fa-solid fa-align-left"></i> Isi Notifikasi</label>
        <textarea id="nf-body" class="form-input" placeholder="Tulis pesan singkat..." maxlength="180" rows="3" style="resize:vertical;min-height:85px;"></textarea>
        <span class="form-hint"><span class="counter" id="nf-body-c">0</span> / 180</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="nf-url"><i class="fa-solid fa-link"></i> URL Tujuan</label>
        <input type="url" id="nf-url" class="form-input" placeholder="https://deploy.project.ekkstore.web.id/" value="https://deploy.project.ekkstore.web.id/">
      </div>
      <div class="form-group">
        <label class="form-label"><i class="fa-solid fa-image"></i> Gambar (opsional)</label>
        <div class="upload-box" id="nf-upload">
          <div class="upload-preview" id="nf-preview"><i class="fa-solid fa-image"></i></div>
          <div class="upload-info">
            <div class="upload-title" id="nf-upload-title">Tap untuk upload gambar</div>
            <div class="upload-hint" id="nf-upload-hint">JPG / PNG · Max 3 MB</div>
          </div>
          <button type="button" class="upload-remove" id="nf-remove"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <input type="file" id="nf-file" accept="image/*" style="display:none;">
      </div>
      <button class="send-btn" id="nf-send"><i class="fa-solid fa-paper-plane"></i> Kirim ke Semua Subscriber</button>
      <div class="result" id="nf-result"><i id="nf-res-icon"></i><span id="nf-res-text"></span></div>
    </div>
  `;

  bindNotifEvents();
  loadSubscriberCount();
}

async function loadSubscriberCount() {
  const el = $('nf-sub');
  if (!el) return;
  el.textContent = '...';
  try {
    const r = await fetch('/api/send-notification');
    const d = await r.json();
    el.textContent = d.count || 0;
  } catch (e) { el.textContent = '?'; }
}

function bindNotifEvents() {
  const title = $('nf-title'), body = $('nf-body');
  const tc = $('nf-title-c'), bc = $('nf-body-c');

  if (title) title.addEventListener('input', () => { tc.textContent = title.value.length; });
  if (body) body.addEventListener('input', () => { bc.textContent = body.value.length; });

  const upload = $('nf-upload'), file = $('nf-file'), remove = $('nf-remove');
  const preview = $('nf-preview'), ut = $('nf-upload-title'), uh = $('nf-upload-hint');

  if (upload && file) {
    upload.addEventListener('click', e => { if (e.target.closest('#nf-remove')) return; file.click(); });
    file.addEventListener('change', function () { if (this.files[0]) handleImageUpload(this.files[0]); });
  }

  if (remove) remove.addEventListener('click', e => {
    e.stopPropagation();
    uploadedImageUrl = '';
    file.value = '';
    upload.classList.remove('has-image');
    preview.innerHTML = '<i class="fa-solid fa-image"></i>';
    ut.textContent = 'Tap untuk upload gambar';
    uh.textContent = 'JPG / PNG · Max 3 MB';
  });

  async function handleImageUpload(f) {
    if (!f.type.startsWith('image/')) return toast('Hanya gambar', 'error');
    if (f.size > 3 * 1024 * 1024) return toast('Max 3 MB', 'error');

    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = '<img src="' + e.target.result + '">'; };
    reader.readAsDataURL(f);

    ut.textContent = 'Uploading...';
    uh.textContent = f.name;

    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      uploadedImageUrl = d.secure_url;
      upload.classList.add('has-image');
      ut.textContent = 'Gambar terpasang';
      uh.textContent = 'Klik untuk ganti';
      toast('Gambar diupload', 'success');
    } catch (e) {
      ut.textContent = 'Upload gagal';
      uh.textContent = 'Coba lagi';
      preview.innerHTML = '<i class="fa-solid fa-image"></i>';
      uploadedImageUrl = '';
      toast('Gagal upload', 'error');
    }
  }

  const send = $('nf-send');
  if (send) send.addEventListener('click', sendNotif);
}

async function sendNotif() {
  const title = ($('nf-title')?.value || '').trim();
  const body = ($('nf-body')?.value || '').trim();
  const url = ($('nf-url')?.value || '').trim() || 'https://deploy.project.ekkstore.web.id/';

  if (!title) return toast('Judul wajib diisi', 'error');
  if (!body) return toast('Isi wajib diisi', 'error');

  const btn = $('nf-send');
  const res = $('nf-result');
  if (btn) btn.disabled = true;
  res.classList.remove('success', 'error');
  res.classList.add('visible', 'loading');
  $('nf-res-icon').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  $('nf-res-text').textContent = 'Mengirim...';

  try {
    const r = await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, url, icon: 'https://files.catbox.moe/kzg0nc.png', image: uploadedImageUrl || '' })
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);

    res.classList.remove('loading');
    res.classList.add('success');
    $('nf-res-icon').innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    $('nf-res-text').textContent = `✓ Terkirim ke ${d.success || 0} perangkat dari ${d.total || 0} subscriber.`;
    toast(`Terkirim ke ${d.success || 0}`, 'success');
    setTimeout(loadSubscriberCount, 1000);
  } catch (e) {
    res.classList.remove('loading');
    res.classList.add('error');
    $('nf-res-icon').innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    $('nf-res-text').textContent = 'Gagal: ' + e.message;
    toast('Gagal kirim', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ============================================================
// DEPLOY
// ============================================================
async function renderDeploy(content) {
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-icon"><i class="fa-solid fa-rocket"></i></div>
      <div class="page-header-text">
        <h1>Laporan Deploy <span class="tag">Live</span></h1>
        <p>Statistik deployment global dan per user.</p>
      </div>
    </div>
    <div class="chips-row" id="dp-chips">
      <button class="chip active" data-days="0">Semua</button>
      <button class="chip" data-days="1">1 Hari</button>
      <button class="chip" data-days="3">3 Hari</button>
      <button class="chip" data-days="7">7 Hari</button>
      <button class="chip" data-days="30">30 Hari</button>
    </div>
    <div class="stat-grid" id="dp-stats">
      <div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>
    </div>
    <div class="card-x">
      <h3><i class="fa-solid fa-users"></i> Per User</h3>
      <div id="dp-users"></div>
    </div>
  `;

  currentDeployDays = 0;
  bindChips('dp-chips', days => { currentDeployDays = days; loadDeployData(); });
  loadDeployData();
}

async function loadDeployData() {
  const statsEl = $('dp-stats');
  const usersEl = $('dp-users');
  if (!statsEl) return;
  statsEl.innerHTML = '<div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>';

  try {
    const d = await fetchDeployStats(currentDeployDays);
    const g = d.global || {};

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon orange"><i class="fa-solid fa-layer-group"></i></div>
        <div class="stat-info"><span class="stat-value">${g.total || 0}</span><span class="stat-label">Total Deploy</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"><i class="fa-solid fa-circle-check"></i></div>
        <div class="stat-info"><span class="stat-value">${g.success || 0}</span><span class="stat-label">Berhasil</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><i class="fa-solid fa-circle-xmark"></i></div>
        <div class="stat-info"><span class="stat-value">${g.failed || 0}</span><span class="stat-label">Gagal</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon purple"><i class="fa-solid fa-spinner"></i></div>
        <div class="stat-info"><span class="stat-value">${g.proses || 0}</span><span class="stat-label">Proses</span></div>
      </div>
    `;

    const users = d.per_user || [];
    if (users.length === 0) {
      usersEl.innerHTML = '<div class="empty"><i class="fa-solid fa-inbox"></i><p>Belum ada data</p></div>';
      return;
    }

    usersEl.innerHTML = users.map(u => {
      const initial = (u.username || '?')[0].toUpperCase();
      const avatarHTML = u.avatar
        ? `<img src="${escapeHTML(u.avatar)}" alt="" onerror="this.parentElement.textContent='${escapeHTML(initial)}'">`
        : escapeHTML(initial);
      const nameColor = u.has_profile ? '#f2f2f5' : '#78788a';

      return `
        <div class="list-row" style="flex-direction:column;align-items:stretch;padding:14px;">
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="list-avatar" style="background:${u.has_profile ? '#2a1e16' : '#1a1a20'};color:${u.has_profile ? '#f97316' : '#78788a'};">${avatarHTML}</div>
            <div class="list-info">
              <div class="list-name" style="color:${nameColor};">
                ${escapeHTML(u.username)}
                ${u.has_profile ? '' : '<span style="font-size:9px;color:#52525e;font-weight:600;margin-left:6px;">(tanpa profil)</span>'}
              </div>
              <div class="list-meta">
                <span><i class="fa-regular fa-clock"></i> ${relativeTime(u.last_deploy)}</span>
                <span><i class="fa-solid fa-hashtag"></i> ${escapeHTML(u.uid.slice(0, 12))}...</span>
              </div>
            </div>
            <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">
              <span class="badge success">✓ ${u.success}</span>
              <span class="badge failed">✕ ${u.failed}</span>
              ${u.proses > 0 ? `<span class="badge proses">⟳ ${u.proses}</span>` : ''}
            </div>
          </div>
          <div style="margin-top:12px;padding-left:52px;display:flex;flex-direction:column;gap:6px;">
            ${(u.projects || []).slice(0, 5).map(p => renderDeployRow(p, false)).join('')}
            ${(u.projects || []).length > 5 ? `<div style="color:#78788a;font-size:11px;text-align:center;padding:6px;">+ ${u.projects.length - 5} project lainnya</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    statsEl.innerHTML = '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Gagal memuat: ' + escapeHTML(e.message) + '</p></div>';
  }
}

// ============================================================
// PENGUNJUNG
// ============================================================
async function renderPengunjung(content) {
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-icon"><i class="fa-solid fa-users"></i></div>
      <div class="page-header-text">
        <h1>Pengunjung <span class="tag">Live</span></h1>
        <p>Statistik pengunjung dan status follow.</p>
      </div>
    </div>
    <div class="chips-row" id="pg-chips">
      <button class="chip active" data-days="0">Semua</button>
      <button class="chip" data-days="1">1 Hari</button>
      <button class="chip" data-days="3">3 Hari</button>
      <button class="chip" data-days="7">7 Hari</button>
      <button class="chip" data-days="30">30 Hari</button>
    </div>
    <div class="stat-grid" id="pg-stats">
      <div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>
    </div>
    <div class="card-x">
      <h3><i class="fa-solid fa-chart-bar"></i> Detail Per Hari</h3>
      <div id="pg-detail"></div>
    </div>
  `;

  currentStatsDays = 0;
  bindChips('pg-chips', days => { currentStatsDays = days; loadPengunjungData(); });
  loadPengunjungData();
}

async function loadPengunjungData() {
  const statsEl = $('pg-stats');
  const detailEl = $('pg-detail');
  if (!statsEl) return;
  statsEl.innerHTML = '<div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>';

  try {
    const d = await fetchStats(currentStatsDays);
    const p = d.pengunjung || {};

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon orange"><i class="fa-solid fa-users"></i></div>
        <div class="stat-info"><span class="stat-value">${p.total || 0}</span><span class="stat-label">Total Pengunjung</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"><i class="fa-solid fa-circle-check"></i></div>
        <div class="stat-info"><span class="stat-value">${p.follow || 0}</span><span class="stat-label">Follow Berhasil</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon red"><i class="fa-solid fa-circle-xmark"></i></div>
        <div class="stat-info"><span class="stat-value">${p.belum || 0}</span><span class="stat-label">Belum Follow</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue"><i class="fa-solid fa-bell"></i></div>
        <div class="stat-info"><span class="stat-value">${d.subscriber || 0}</span><span class="stat-label">Subscriber</span></div>
      </div>
    `;

    const detail = (p.detail || []).slice().reverse();
    if (detail.length === 0) {
      detailEl.innerHTML = '<div class="empty"><i class="fa-solid fa-inbox"></i><p>Belum ada data</p></div>';
      return;
    }

    detailEl.innerHTML = detail.map(dd => `
      <div class="list-row" style="padding:10px 14px;">
        <div class="list-avatar" style="background:#1a1a20;color:#78788a;font-size:11px;font-family:JetBrains Mono,monospace;">
          ${escapeHTML(dd.date.slice(5))}
        </div>
        <div class="list-info">
          <div class="list-name" style="font-size:12px;">${escapeHTML(dd.date)}</div>
          <div class="list-meta">
            <span><i class="fa-solid fa-eye"></i> ${dd.visit} visit</span>
            <span><i class="fa-solid fa-circle-check"></i> ${dd.follow} follow</span>
            ${dd.click_install > 0 ? `<span><i class="fa-solid fa-hand-pointer"></i> ${dd.click_install} klik</span>` : ''}
            ${dd.install_app > 0 ? `<span><i class="fa-solid fa-download"></i> ${dd.install_app} install</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    statsEl.innerHTML = '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Gagal memuat: ' + escapeHTML(e.message) + '</p></div>';
  }
}

// ============================================================
// APK
// ============================================================
async function renderApk(content) {
  content.innerHTML = `
    <div class="page-header">
      <div class="page-header-icon"><i class="fa-solid fa-mobile-screen-button"></i></div>
      <div class="page-header-text">
        <h1>APK Install <span class="tag">PWA</span></h1>
        <p>Statistik install aplikasi PWA.</p>
      </div>
    </div>
    <div class="chips-row" id="ak-chips">
      <button class="chip active" data-days="0">Semua</button>
      <button class="chip" data-days="1">1 Hari</button>
      <button class="chip" data-days="3">3 Hari</button>
      <button class="chip" data-days="7">7 Hari</button>
      <button class="chip" data-days="30">30 Hari</button>
    </div>
    <div class="stat-grid" id="ak-stats">
      <div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>
    </div>
  `;

  currentStatsDays = 0;
  bindChips('ak-chips', days => { currentStatsDays = days; loadApkData(); });
  loadApkData();
}

async function loadApkData() {
  const el = $('ak-stats');
  if (!el) return;
  el.innerHTML = '<div class="loading-spin"><i class="fa-solid fa-spinner fa-spin"></i> Memuat...</div>';

  try {
    const d = await fetchStats(currentStatsDays);
    const a = d.apk || {};

    el.innerHTML = `
      <div class="stat-card">
        <div class="stat-icon orange"><i class="fa-solid fa-hand-pointer"></i></div>
        <div class="stat-info"><span class="stat-value">${a.click_install || 0}</span><span class="stat-label">Klik Install</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon green"><i class="fa-solid fa-download"></i></div>
        <div class="stat-info"><span class="stat-value">${a.install_app || 0}</span><span class="stat-label">Berhasil Install</span></div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = '<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i><p>Gagal memuat: ' + escapeHTML(e.message) + '</p></div>';
  }
}

// ============================================================
// UTILS
// ============================================================
function bindChips(containerId, cb) {
  const el = $(containerId);
  if (!el) return;
  el.querySelectorAll('.chip').forEach(c => {
    c.addEventListener('click', () => {
      el.querySelectorAll('.chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      cb(parseInt(c.dataset.days, 10));
    });
  });
}

// ============================================================
// INIT
// ============================================================
function init() {
  const loginBtn = $('login-btn');
  const loginInput = $('admin-password');
  const logoutBtn = $('logout-btn');
  const menuBtn = $('mobile-menu-btn');
  const backdrop = $('admin-sidebar-backdrop');

  if (loginBtn) loginBtn.addEventListener('click', () => {
    if ((loginInput?.value || '').trim() === ADMIN_PASSWORD) {
      setLoggedIn();
      $('login-error').classList.remove('visible');
      showApp();
    } else {
      $('login-error').classList.add('visible');
      if (loginInput) { loginInput.value = ''; loginInput.focus(); }
    }
  });

  if (loginInput) loginInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn?.click(); });

  if (logoutBtn) logoutBtn.addEventListener('click', () => { clearLogin(); showLogin(); });
  if (menuBtn) menuBtn.addEventListener('click', openSidebar);
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  document.querySelectorAll('.sidebar-link').forEach(a => {
    a.addEventListener('click', function(e) {
      e.preventDefault();
      const nav = this.dataset.nav;
      window.location.hash = nav === 'dashboard' ? '' : nav;
    });
  });

  window.addEventListener('hashchange', route);

  if (isLoggedIn()) showApp();
  else {
    showLogin();
    setTimeout(() => loginInput?.focus(), 300);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();