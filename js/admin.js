(function () {
'use strict';

const ADMIN_PASSWORD = 'ekkadmin2024';
const SESSION_KEY = 'ekk_admin_session_v1';
const SESSION_DURATION = 12 * 60 * 60 * 1000;
const CLOUDINARY_CLOUD_NAME = 'uuvl0m4s';
const CLOUDINARY_UPLOAD_PRESET = 'Deploy-EkkStore';

let uploadedImageUrl = '';

function $(id) { return document.getElementById(id); }

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toast(msg, type) {
  const el = $('toast');
  if (!el) return;
  let icon = '<i class="fa-solid fa-circle-info" style="color:#f97316;"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:#22d3a8;"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark" style="color:#f0616b;"></i>';
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
  $('panel').classList.remove('visible');
  $('admin-header').style.display = 'none';
}

function showPanel() {
  $('login-screen').classList.add('hidden');
  $('panel').classList.add('visible');
  $('admin-header').style.display = 'flex';
  loadSubscriberCount();
}

async function loadSubscriberCount() {
  const el = $('sub-count');
  if (!el) return;
  el.textContent = '...';
  try {
    const r = await fetch('/api/send-notification');
    const d = await r.json();
    el.textContent = d.count || 0;
  } catch (e) { el.textContent = '?'; }
}

function setupImageUpload() {
  const box = $('upload-box'), input = $('image-input'), remove = $('upload-remove');
  const preview = $('upload-preview'), title = $('upload-title'), hint = $('upload-hint');
  if (!box || !input) return;

  box.addEventListener('click', (e) => {
    if (e.target.closest('#upload-remove')) return;
    input.click();
  });

  input.addEventListener('change', function () {
    if (this.files[0]) handleUpload(this.files[0]);
  });

  remove.addEventListener('click', (e) => {
    e.stopPropagation();
    uploadedImageUrl = '';
    input.value = '';
    box.classList.remove('has-image');
    preview.innerHTML = '<i class="fa-solid fa-image"></i>';
    title.textContent = 'Tap untuk upload gambar';
    hint.textContent = 'JPG / PNG · Max 3 MB';
  });

  async function handleUpload(f) {
    if (!f.type.startsWith('image/')) return toast('Hanya gambar', 'error');
    if (f.size > 3 * 1024 * 1024) return toast('Max 3 MB', 'error');

    const reader = new FileReader();
    reader.onload = e => { preview.innerHTML = '<img src="' + e.target.result + '">'; };
    reader.readAsDataURL(f);

    title.textContent = 'Uploading...';
    hint.textContent = f.name;

    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      uploadedImageUrl = d.secure_url;
      box.classList.add('has-image');
      title.textContent = 'Gambar terpasang';
      hint.textContent = 'Klik untuk ganti';
      toast('Gambar diupload', 'success');
    } catch (e) {
      title.textContent = 'Upload gagal';
      hint.textContent = 'Coba lagi';
      preview.innerHTML = '<i class="fa-solid fa-image"></i>';
      uploadedImageUrl = '';
      toast('Gagal upload', 'error');
    }
  }
}

async function sendNotif() {
  const title = ($('title')?.value || '').trim();
  const body = ($('body')?.value || '').trim();
  const url = ($('url')?.value || '').trim() || 'https://deploy.project.ekkstore.web.id/';

  if (!title) return toast('Judul wajib diisi', 'error');
  if (!body) return toast('Isi wajib diisi', 'error');

  const btn = $('btn-send');
  const res = $('result');
  const icon = $('result-icon');
  const txt = $('result-text');

  btn.disabled = true;
  res.classList.remove('success', 'error');
  res.classList.add('visible', 'loading');
  icon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  txt.textContent = 'Mengirim...';

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
    icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    txt.textContent = `✓ Terkirim ke ${d.success || 0} perangkat dari ${d.total || 0} subscriber.`;
    toast(`Terkirim ke ${d.success || 0}`, 'success');
    setTimeout(loadSubscriberCount, 1000);
  } catch (e) {
    res.classList.remove('loading');
    res.classList.add('error');
    icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    txt.textContent = 'Gagal: ' + e.message;
    toast('Gagal kirim', 'error');
  } finally {
    btn.disabled = false;
  }
}

function init() {
  const loginBtn = $('login-btn');
  const loginInput = $('admin-password');
  const logoutBtn = $('logout-btn');
  const title = $('title');
  const body = $('body');

  loginBtn.addEventListener('click', () => {
    if ((loginInput.value || '').trim() === ADMIN_PASSWORD) {
      setLoggedIn();
      $('login-error').classList.remove('visible');
      showPanel();
    } else {
      $('login-error').classList.add('visible');
      loginInput.value = '';
      loginInput.focus();
    }
  });

  loginInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

  logoutBtn.addEventListener('click', () => { clearLogin(); showLogin(); });

  title.addEventListener('input', () => { $('title-c').textContent = title.value.length; });
  body.addEventListener('input', () => { $('body-c').textContent = body.value.length; });

  $('btn-send').addEventListener('click', sendNotif);

  setupImageUpload();

  if (isLoggedIn()) showPanel();
  else { showLogin(); setTimeout(() => loginInput.focus(), 300); }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();