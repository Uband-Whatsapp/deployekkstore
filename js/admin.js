/* ============================================================
   ADMIN DASHBOARD v3 — Match web utama
   ============================================================ */
(function() {
  'use strict';

  const ADMIN_PASSWORD = 'ekkadmin2024'; // ⚠️ GANTI INI
  const SESSION_KEY = 'ekk_admin_logged';
  const SESSION_DURATION = 12 * 60 * 60 * 1000;

  const CLOUDINARY_CLOUD_NAME = 'uuvl0m4s';
  const CLOUDINARY_UPLOAD_PRESET = 'Deploy-EkkStore';

  const DESIGN_PRESETS = {
    minimal: { icon: 'https://files.catbox.moe/kzg0nc.png', vibrate: [100], requireInteraction: false, tag: 'ekk-minimal', fallbackIcon: 'fa-feather', label: 'Minimal' },
    classic: { icon: 'https://files.catbox.moe/kzg0nc.png', vibrate: [200,100,200], requireInteraction: false, tag: 'ekk-classic', fallbackIcon: 'fa-bullhorn', label: 'Classic' },
    image:   { icon: 'https://files.catbox.moe/kzg0nc.png', vibrate: [200,100,200], requireInteraction: false, tag: 'ekk-image', fallbackIcon: 'fa-image', label: 'Gambar' },
    urgent:  { icon: 'https://files.catbox.moe/kzg0nc.png', vibrate: [500,200,500,200,500], requireInteraction: true, tag: 'ekk-urgent', fallbackIcon: 'fa-triangle-exclamation', label: 'Urgent' }
  };

  let currentDesign = 'classic';
  let uploadedImageUrl = '';

  function $(id) { return document.getElementById(id); }

  function showToast(msg, type) {
    const toast = $('toast');
    if (!toast) return;
    let icon = '';
    if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:var(--success);"></i>';
    else if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger);"></i>';
    else icon = '<i class="fa-solid fa-circle-info" style="color:var(--accent);"></i>';
    toast.innerHTML = icon + ' ' + msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function showResult(type, text) {
    const box = $('result'), icon = $('result-icon'), txt = $('result-text');
    if (!box || !icon || !txt) return;
    box.classList.remove('success', 'error', 'loading');
    box.classList.add('visible', type);
    if (type === 'loading') icon.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    else if (type === 'success') icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
    else if (type === 'error') icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
    txt.textContent = text;
  }

  function isLoggedIn() {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (!data) return false;
      const p = JSON.parse(data);
      return p.expiresAt && Date.now() < p.expiresAt;
    } catch (e) { return false; }
  }

  function setLoggedIn() {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ expiresAt: Date.now() + SESSION_DURATION })); } catch (e) {}
  }

  function clearLogin() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

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
    const el1 = $('sub-count');
    const el2 = $('stat-sub-count');
    if (el1) el1.textContent = '...';
    if (el2) el2.textContent = '...';
    try {
      const res = await fetch('/api/send-notification');
      const data = await res.json();
      const count = data.count || 0;
      if (el1) el1.textContent = count;
      if (el2) el2.textContent = count;
    } catch (e) {
      if (el1) el1.textContent = '?';
      if (el2) el2.textContent = '?';
    }
  }

  function setDesign(design) {
    currentDesign = design;
    document.querySelectorAll('.design-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.design === design);
    });

    const phone = $('phone-notif');
    if (phone) phone.setAttribute('data-design', design);

    const imageGroup = $('image-group');
    if (imageGroup) imageGroup.style.display = design === 'image' ? 'flex' : 'none';

    const statDesign = $('stat-design');
    if (statDesign) statDesign.textContent = DESIGN_PRESETS[design]?.label || design;

    const preset = DESIGN_PRESETS[design];
    const thumb = $('pn-thumb');
    if (thumb && !uploadedImageUrl) thumb.innerHTML = '<i class="fa-solid ' + preset.fallbackIcon + '"></i>';

    const pnImage = $('pn-image');
    if (pnImage && !uploadedImageUrl) pnImage.innerHTML = '<i class="fa-solid fa-image"></i>';

    updatePreview();
  }

  function updatePreview() {
    const title = ($('title')?.value || '').trim();
    const body = ($('body')?.value || '').trim();
    const url = ($('url')?.value || '').trim();

    if ($('title-count')) $('title-count').textContent = ($('title')?.value || '').length;
    if ($('body-count')) $('body-count').textContent = ($('body')?.value || '').length;

    if ($('pn-title')) {
      $('pn-title').textContent = title || 'Ekk Store';
      $('pn-title').style.opacity = title ? '1' : '0.5';
    }
    if ($('pn-body')) {
      $('pn-body').textContent = body || 'Isi notifikasi akan muncul di sini saat Anda mengetik.';
      $('pn-body').style.opacity = body ? '1' : '0.5';
    }
    if ($('pn-url')) {
      if (url) {
        $('pn-url').style.display = 'block';
        $('pn-url').textContent = url.replace(/^https?:\/\//, '');
      } else {
        $('pn-url').style.display = 'none';
      }
    }
    if ($('pn-thumb') && currentDesign !== 'image') {
      if (uploadedImageUrl) $('pn-thumb').innerHTML = '<img src="' + uploadedImageUrl + '" alt="">';
      else {
        const preset = DESIGN_PRESETS[currentDesign];
        $('pn-thumb').innerHTML = '<i class="fa-solid ' + preset.fallbackIcon + '"></i>';
      }
    }
    if ($('pn-image')) {
      if (uploadedImageUrl) $('pn-image').innerHTML = '<img src="' + uploadedImageUrl + '" alt="">';
      else $('pn-image').innerHTML = '<i class="fa-solid fa-image"></i>';
    }
  }

  function setupImageUpload() {
    const box = $('upload-box'), input = $('image-input'), removeBtn = $('upload-remove');
    const preview = $('upload-preview'), titleEl = $('upload-title'), hintEl = $('upload-hint');
    if (!box || !input) return;

    box.addEventListener('click', (e) => {
      if (e.target.closest('#upload-remove')) return;
      input.click();
    });
    input.addEventListener('change', function() {
      if (this.files && this.files[0]) handleUpload(this.files[0]);
    });
    if (removeBtn) removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      uploadedImageUrl = '';
      input.value = '';
      box.classList.remove('has-image');
      preview.innerHTML = '<i class="fa-solid fa-image"></i>';
      titleEl.textContent = 'Tap untuk upload gambar';
      hintEl.textContent = 'JPG / PNG · Max 3 MB';
      updatePreview();
    });

    async function handleUpload(file) {
      if (!file.type.startsWith('image/')) { showToast('Hanya gambar', 'error'); return; }
      if (file.size > 3 * 1024 * 1024) { showToast('Max 3 MB', 'error'); return; }

      const reader = new FileReader();
      reader.onload = (e) => { preview.innerHTML = '<img src="' + e.target.result + '">'; };
      reader.readAsDataURL(file);

      titleEl.textContent = 'Mengupload...';
      hintEl.textContent = file.name;

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        uploadedImageUrl = data.secure_url;
        box.classList.add('has-image');
        titleEl.textContent = 'Gambar terpasang';
        hintEl.textContent = 'Klik untuk ganti';
        updatePreview();
        showToast('Gambar diupload', 'success');
      } catch (err) {
        titleEl.textContent = 'Upload gagal';
        hintEl.textContent = 'Coba lagi';
        preview.innerHTML = '<i class="fa-solid fa-image"></i>';
        uploadedImageUrl = '';
        updatePreview();
        showToast('Gagal upload', 'error');
      }
    }
  }

  function validateForm() {
    const title = ($('title')?.value || '').trim();
    const body = ($('body')?.value || '').trim();
    const url = ($('url')?.value || '').trim() || 'https://deploy.project.ekkstore.web.id/';
    if (!title) { showToast('Judul wajib diisi', 'error'); return null; }
    if (!body) { showToast('Isi wajib diisi', 'error'); return null; }
    try { new URL(url); } catch (e) { showToast('URL tidak valid', 'error'); return null; }
    return { title, body, url };
  }

  async function sendNotif() {
    const data = validateForm();
    if (!data) return;

    const preset = DESIGN_PRESETS[currentDesign] || DESIGN_PRESETS.classic;
    const btnSend = $('btn-send');
    if (btnSend) btnSend.disabled = true;
    showResult('loading', 'Mengirim notifikasi ke semua subscriber...');

    try {
      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          body: data.body,
          url: data.url,
          icon: preset.icon,
          image: uploadedImageUrl || '',
          vibrate: preset.vibrate,
          requireInteraction: preset.requireInteraction,
          tag: preset.tag
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'HTTP ' + res.status);

      const sent = result.success || 0;
      const total = result.total || 0;
      showResult('success', `✓ Notifikasi terkirim ke ${sent} perangkat dari ${total} subscriber.`);
      showToast(`Terkirim ke ${sent} perangkat`, 'success');

      // Update last sent
      const statLast = $('stat-last');
      if (statLast) {
        const now = new Date();
        statLast.textContent = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
      }

      setTimeout(loadSubscriberCount, 1000);
    } catch (err) {
      console.error('[Send]', err);
      showResult('error', 'Gagal kirim: ' + err.message);
      showToast('Gagal kirim notif', 'error');
    } finally {
      if (btnSend) btnSend.disabled = false;
    }
  }

  function bootstrap() {
    const loginBtn = $('login-btn'), loginInput = $('admin-password'), logoutBtn = $('logout-btn');

    if (loginBtn) loginBtn.addEventListener('click', () => {
      if ((loginInput?.value || '').trim() === ADMIN_PASSWORD) {
        setLoggedIn();
        $('login-error').classList.remove('visible');
        showPanel();
      } else {
        $('login-error').classList.add('visible');
        loginInput.value = '';
        loginInput.focus();
      }
    });
    if (loginInput) loginInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn?.click(); });
    if (logoutBtn) logoutBtn.addEventListener('click', () => { clearLogin(); showLogin(); });

    document.querySelectorAll('.design-btn').forEach(btn => {
      btn.addEventListener('click', () => setDesign(btn.dataset.design));
    });

    ['title', 'body', 'url'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', updatePreview);
    });

    setupImageUpload();
    if ($('btn-send')) $('btn-send').addEventListener('click', sendNotif);

    setDesign('classic');

    if (isLoggedIn()) showPanel();
    else { showLogin(); setTimeout(() => loginInput?.focus(), 300); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();