/* ============================================================
   ADMIN DASHBOARD — Kirim Notifikasi
   Password: cek client-side saja (sama seperti gate screen)
   Backend: TIDAK ADA AUTH — pakai endpoint yang sama dengan bot
   ============================================================ */
(function() {
  'use strict';

  const ADMIN_PASSWORD = 'Admin1';

  const SESSION_KEY = 'ekk_admin_logged';
  const SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 jam

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
    const box = $('result');
    const icon = $('result-icon');
    const txt = $('result-text');
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
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        expiresAt: Date.now() + SESSION_DURATION
      }));
    } catch (e) {}
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
      const res = await fetch('/api/send-notification');
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      el.textContent = data.count || 0;
    } catch (e) {
      el.textContent = '?';
    }
  }

  function updatePreview() {
    const title = ($('title')?.value || '').trim();
    const body = ($('body')?.value || '').trim();
    const url = ($('url')?.value || '').trim();

    if ($('title-count')) $('title-count').textContent = ($('title')?.value || '').length;
    if ($('body-count')) $('body-count').textContent = ($('body')?.value || '').length;

    if ($('preview-title')) {
      $('preview-title').textContent = title || 'Ekk Store';
      $('preview-title').style.opacity = title ? '1' : '0.5';
    }
    if ($('preview-body')) {
      $('preview-body').textContent = body || 'Isi notif akan muncul di sini.';
      $('preview-body').style.opacity = body ? '1' : '0.5';
    }
    if ($('preview-url')) {
      if (url) {
        $('preview-url').style.display = 'block';
        $('preview-url').textContent = url.replace(/^https?:\/\//, '');
      } else {
        $('preview-url').style.display = 'none';
      }
    }
  }

  function validateForm() {
    const title = ($('title')?.value || '').trim();
    const body = ($('body')?.value || '').trim();
    const url = ($('url')?.value || '').trim() || 'https://deploy.project.ekkstore.web.id/';

    if (!title) { showToast('Judul wajib diisi', 'error'); return null; }
    if (!body) { showToast('Isi notif wajib diisi', 'error'); return null; }

    try { new URL(url); } catch (e) { showToast('URL tidak valid', 'error'); return null; }

    return { title, body, url };
  }

  async function sendNotif(testMode) {
    const data = validateForm();
    if (!data) return;

    const btnSend = $('btn-send');
    const btnTest = $('btn-test');
    if (btnSend) btnSend.disabled = true;
    if (btnTest) btnTest.disabled = true;

    showResult('loading', testMode ? 'Mengirim test notif...' : 'Mengirim ke semua subscriber...');

    try {
      const res = await fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          body: data.body,
          icon: 'https://files.catbox.moe/kzg0nc.png',
          url: data.url,
          testMode: testMode
        })
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.error || 'HTTP ' + res.status);

      const sent = result.success || 0;
      const total = result.total || 0;

      if (testMode) {
        if (sent > 0) {
          showResult('success', '✓ Test notif terkirim ke 1 subscriber!');
          showToast('Test notif terkirim', 'success');
        } else {
          showResult('error', 'Tidak ada subscriber aktif untuk test.');
        }
      } else {
        showResult('success', `✓ Notifikasi terkirim ke ${sent} perangkat dari ${total} subscriber.`);
        showToast(`Terkirim ke ${sent} perangkat`, 'success');
      }

      setTimeout(loadSubscriberCount, 1000);
    } catch (err) {
      console.error('[Send]', err);
      showResult('error', 'Gagal kirim: ' + err.message);
      showToast('Gagal kirim notif', 'error');
    } finally {
      if (btnSend) btnSend.disabled = false;
      if (btnTest) btnTest.disabled = false;
    }
  }

  function bootstrap() {
    const loginBtn = $('login-btn');
    const loginInput = $('admin-password');
    const logoutBtn = $('logout-btn');
    const titleInput = $('title');
    const bodyInput = $('body');
    const urlInput = $('url');

    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        const pwd = (loginInput?.value || '').trim();
        if (pwd === ADMIN_PASSWORD) {
          setLoggedIn();
          $('login-error').classList.remove('visible');
          showPanel();
          showToast('Login berhasil', 'success');
        } else {
          $('login-error').classList.add('visible');
          loginInput.value = '';
          loginInput.focus();
        }
      });
    }
    if (loginInput) {
      loginInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn?.click();
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        clearLogin();
        showLogin();
      });
    }

    if (titleInput) titleInput.addEventListener('input', updatePreview);
    if (bodyInput) bodyInput.addEventListener('input', updatePreview);
    if (urlInput) urlInput.addEventListener('input', updatePreview);

    if ($('btn-send')) $('btn-send').addEventListener('click', () => sendNotif(false));
    if ($('btn-test')) $('btn-test').addEventListener('click', () => sendNotif(true));

    if (isLoggedIn()) showPanel();
    else {
      showLogin();
      setTimeout(() => loginInput?.focus(), 300);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();