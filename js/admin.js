(function () {
'use strict';

/* ============================================================
   EKK STORE — ADMIN NOTIFICATION
   ============================================================ */

const SESSION_KEY = 'ekk_admin_session_v1';

const SESSION_DURATION =
  12 * 60 * 60 * 1000;

const DRAFT_KEY =
  'ekk_notification_draft_v2';

const CLOUDINARY_CLOUD_NAME =
  'uuvl0m4s';

const CLOUDINARY_UPLOAD_PRESET =
  'Deploy-EkkStore';

const DEFAULT_URL =
  'https://deploy.project.ekkstore.web.id/';

let uploadedImageUrl = '';

let uploadedImagePreview = '';


/* ============================================================
   HELPER
   ============================================================ */

function $(id) {
  return document.getElementById(id);
}


function escapeHTML(s) {
  if (s == null) return '';

  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


/* ============================================================
   TOAST
   ============================================================ */

function toast(msg, type) {

  const el = $('toast');

  if (!el) return;

  let icon =
    '<i class="fa-solid fa-circle-info" style="color:#f97316;"></i>';

  if (type === 'success') {
    icon =
      '<i class="fa-solid fa-circle-check" style="color:#22d3a8;"></i>';
  }

  if (type === 'error') {
    icon =
      '<i class="fa-solid fa-circle-xmark" style="color:#f0616b;"></i>';
  }

  el.innerHTML =
    icon + ' ' + escapeHTML(msg);

  el.classList.add('show');

  clearTimeout(el._t);

  el._t = setTimeout(() => {
    el.classList.remove('show');
  }, 2600);
}


/* ============================================================
   LOGIN SESSION
   ============================================================ */

function isLoggedIn() {

  try {

    const d =
      localStorage.getItem(SESSION_KEY);

    if (!d) return false;

    const p = JSON.parse(d);

    return (
      p.expiresAt &&
      Date.now() < p.expiresAt
    );

  } catch (e) {

    return false;
  }
}


function setLoggedIn() {

  try {

    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        expiresAt:
          Date.now() + SESSION_DURATION
      })
    );

  } catch (e) {}
}


function clearLogin() {

  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}

}


/* ============================================================
   LOGIN / PANEL
   ============================================================ */

function showLogin() {

  $('login-screen')?.classList.remove('hidden');

  $('panel')?.classList.remove('visible');

  const header = $('admin-header');

  if (header) {
    header.style.display = 'none';
  }
}


function showPanel() {

  $('login-screen')?.classList.add('hidden');

  $('panel')?.classList.add('visible');

  const header = $('admin-header');

  if (header) {
    header.style.display = 'flex';
  }

  loadSubscriberCount();

  restoreDraft();

  updatePreview();

  updateCounters();
}


/* ============================================================
   CEK PASSWORD DI SERVER
   ============================================================ */

async function checkPasswordOnServer(password) {

  const r = await fetch('/api/send-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'login',
      password: password
    })
  });

  let d = {};
  try { d = await r.json(); } catch (e) {}

  return r.ok && d.success === true;
}


/* ============================================================
   SUBSCRIBER COUNT
   ============================================================ */

async function loadSubscriberCount() {

  const el = $('sub-count');

  if (!el) return;

  el.textContent = '...';

  try {

    const r =
      await fetch('/api/send-notification');

    const d =
      await r.json();

    el.textContent =
      d.count || 0;

  } catch (e) {

    el.textContent = '?';
  }
}


/* ============================================================
   COUNTERS
   ============================================================ */

function updateCounters() {

  const title = $('title');
  const body = $('body');

  const titleCounter = $('title-c');
  const bodyCounter = $('body-c');

  if (title && titleCounter) {
    titleCounter.textContent =
      title.value.length;
  }

  if (body && bodyCounter) {
    bodyCounter.textContent =
      body.value.length;
  }
}


/* ============================================================
   LIVE PREVIEW
   ============================================================ */

function updatePreview() {

  const title =
    ($('title')?.value || '').trim();

  const body =
    ($('body')?.value || '').trim();

  const url =
    ($('url')?.value || '').trim();

  const pnTitle =
    $('pn-title');

  const pnBody =
    $('pn-body');

  const pnUrl =
    $('pn-url');

  const pnImage =
    $('pn-image');

  if (pnTitle) {

    pnTitle.textContent =
      title || 'Ekk Store Update';
  }

  if (pnBody) {

    pnBody.textContent =
      body ||
      'Tulis pesan singkat untuk melihat preview notifikasi.';
  }

  if (pnUrl) {

    let displayUrl =
      url || DEFAULT_URL;

    try {

      const parsed =
        new URL(displayUrl);

      displayUrl =
        parsed.host +
        parsed.pathname;

      if (displayUrl.endsWith('/')) {
        displayUrl =
          displayUrl.slice(0, -1);
      }

    } catch (e) {

      displayUrl =
        displayUrl.replace(/^https?:\/\//, '');
    }

    pnUrl.textContent =
      displayUrl;
  }

  if (pnImage) {

    if (uploadedImagePreview) {

      pnImage.src =
        uploadedImagePreview;

      pnImage.style.display =
        'block';

    } else {

      pnImage.removeAttribute('src');

      pnImage.style.display =
        'none';
    }
  }

  updatePreviewTime();
}


/* ============================================================
   PREVIEW TIME
   ============================================================ */

function updatePreviewTime() {

  const now =
    new Date();

  const h =
    String(now.getHours()).padStart(2, '0');

  const m =
    String(now.getMinutes()).padStart(2, '0');

  const time =
    `${h}:${m}`;

  const phoneTime =
    $('phone-time');

  const pnTime =
    $('pn-time');

  if (phoneTime) {
    phoneTime.textContent =
      time;
  }

  if (pnTime) {
    pnTime.textContent =
      'sekarang';
  }
}


/* ============================================================
   AUTO SAVE DRAFT
   ============================================================ */

function saveDraft() {

  try {

    const data = {

      title:
        $('title')?.value || '',

      body:
        $('body')?.value || '',

      url:
        $('url')?.value || DEFAULT_URL

    };

    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify(data)
    );

  } catch (e) {}
}


function restoreDraft() {

  try {

    const raw =
      localStorage.getItem(DRAFT_KEY);

    if (!raw) return;

    const data =
      JSON.parse(raw);

    if ($('title') && data.title) {
      $('title').value =
        data.title;
    }

    if ($('body') && data.body) {
      $('body').value =
        data.body;
    }

    if (
      $('url') &&
      data.url
    ) {
      $('url').value =
        data.url;
    }

  } catch (e) {}
}


function clearDraft() {

  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {}

}


/* ============================================================
   IMAGE UPLOAD
   ============================================================ */

function setupImageUpload() {

  const box =
    $('upload-box');

  const input =
    $('image-input');

  const remove =
    $('upload-remove');

  const preview =
    $('upload-preview');

  const title =
    $('upload-title');

  const hint =
    $('upload-hint');

  if (!box || !input) return;


  box.addEventListener('click', (e) => {

    if (
      e.target.closest('#upload-remove')
    ) {
      return;
    }

    input.click();
  });


  input.addEventListener(
    'change',
    function () {

      if (this.files[0]) {
        handleUpload(this.files[0]);
      }

    }
  );


  if (remove) {

    remove.addEventListener(
      'click',
      (e) => {

        e.stopPropagation();

        uploadedImageUrl = '';

        uploadedImagePreview = '';

        input.value = '';

        box.classList.remove(
          'has-image'
        );

        preview.innerHTML =
          '<i class="fa-solid fa-image"></i>';

        title.textContent =
          'Tap untuk upload gambar';

        hint.textContent =
          'JPG / PNG · Max 3 MB';

        updatePreview();
      }
    );

  }


  async function handleUpload(file) {

    if (
      !file.type.startsWith('image/')
    ) {

      toast(
        'Hanya file gambar yang diperbolehkan',
        'error'
      );

      return;
    }


    if (
      file.size > 3 * 1024 * 1024
    ) {

      toast(
        'Ukuran gambar maksimal 3 MB',
        'error'
      );

      return;
    }


    const reader =
      new FileReader();


    reader.onload = (e) => {

      uploadedImagePreview =
        e.target.result;

      preview.innerHTML =
        '<img src="' +
        e.target.result +
        '" alt="Preview">';

      updatePreview();
    };


    reader.readAsDataURL(file);


    title.textContent =
      'Uploading...';

    hint.textContent =
      file.name;


    try {

      const fd =
        new FormData();

      fd.append(
        'file',
        file
      );

      fd.append(
        'upload_preset',
        CLOUDINARY_UPLOAD_PRESET
      );


      const r =
        await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          {
            method: 'POST',
            body: fd
          }
        );


      const d =
        await r.json();


      if (!r.ok || !d.secure_url) {
        throw new Error(
          d.error?.message ||
          'Upload gagal'
        );
      }


      uploadedImageUrl =
        d.secure_url;


      box.classList.add(
        'has-image'
      );


      title.textContent =
        'Gambar terpasang';


      hint.textContent =
        'Klik untuk mengganti gambar';


      toast(
        'Gambar berhasil diupload',
        'success'
      );


      updatePreview();

    } catch (e) {

      title.textContent =
        'Upload gagal';

      hint.textContent =
        'Coba upload lagi';

      preview.innerHTML =
        '<i class="fa-solid fa-image"></i>';

      uploadedImageUrl = '';

      uploadedImagePreview = '';

      updatePreview();

      toast(
        'Gagal upload gambar',
        'error'
      );
    }
  }
}


/* ============================================================
   URL VALIDATION
   ============================================================ */

function isValidUrl(value) {

  if (!value) return true;

  try {

    const u =
      new URL(value);

    return (
      u.protocol === 'http:' ||
      u.protocol === 'https:'
    );

  } catch (e) {

    return false;
  }
}


/* ============================================================
   SEND NOTIFICATION
   ============================================================ */

async function sendNotif() {

  const title =
    ($('title')?.value || '').trim();

  const body =
    ($('body')?.value || '').trim();

  const url =
    ($('url')?.value || '').trim() ||
    DEFAULT_URL;


  if (!title) {

    toast(
      'Judul wajib diisi',
      'error'
    );

    $('title')?.focus();

    return;
  }


  if (!body) {

    toast(
      'Isi notifikasi wajib diisi',
      'error'
    );

    $('body')?.focus();

    return;
  }


  if (!isValidUrl(url)) {

    toast(
      'URL tidak valid',
      'error'
    );

    $('url')?.focus();

    return;
  }


  const btn =
    $('btn-send');

  const res =
    $('result');

  const icon =
    $('result-icon');

  const txt =
    $('result-text');


  if (!btn || !res || !icon || !txt) {
    return;
  }


  btn.disabled = true;


  btn.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';


  res.classList.remove(
    'success',
    'error'
  );

  res.classList.add(
    'visible',
    'loading'
  );


  icon.innerHTML =
    '<i class="fa-solid fa-spinner fa-spin"></i>';


  txt.textContent =
    'Mengirim notifikasi ke semua subscriber...';


  try {

    const r =
      await fetch(
        '/api/send-notification',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({

            title,

            body,

            url,

            icon:
              'https://files.catbox.moe/kzg0nc.png',

            image:
              uploadedImageUrl || ''

          })
        }
      );


    const d =
      await r.json();


    if (!r.ok) {

      throw new Error(
        d.error ||
        'HTTP ' + r.status
      );
    }


    res.classList.remove(
      'loading'
    );

    res.classList.add(
      'success'
    );


    icon.innerHTML =
      '<i class="fa-solid fa-circle-check"></i>';


    txt.textContent =
      `✓ Terkirim ke ${d.success || 0} perangkat dari ${d.total || 0} subscriber.`;


    toast(
      `Terkirim ke ${d.success || 0} perangkat`,
      'success'
    );


    setTimeout(
      loadSubscriberCount,
      1000
    );


    clearDraft();


  } catch (e) {

    console.error(
      '[Send Notification]',
      e
    );


    res.classList.remove(
      'loading'
    );

    res.classList.add(
      'error'
    );


    icon.innerHTML =
      '<i class="fa-solid fa-circle-xmark"></i>';


    txt.textContent =
      'Gagal: ' +
      e.message;


    toast(
      'Gagal mengirim notifikasi',
      'error'
    );


  } finally {

    btn.disabled = false;

    btn.innerHTML =
      '<i class="fa-solid fa-paper-plane"></i> Kirim ke Semua Subscriber';
  }
}


/* ============================================================
   RESET FORM
   ============================================================ */

function resetForm() {

  const title =
    $('title');

  const body =
    $('body');

  const url =
    $('url');

  const input =
    $('image-input');

  const box =
    $('upload-box');

  const preview =
    $('upload-preview');

  const uploadTitle =
    $('upload-title');

  const uploadHint =
    $('upload-hint');


  if (title) {
    title.value = '';
  }


  if (body) {
    body.value = '';
  }


  if (url) {
    url.value =
      DEFAULT_URL;
  }


  uploadedImageUrl = '';

  uploadedImagePreview = '';


  if (input) {
    input.value = '';
  }


  if (box) {
    box.classList.remove(
      'has-image'
    );
  }


  if (preview) {

    preview.innerHTML =
      '<i class="fa-solid fa-image"></i>';
  }


  if (uploadTitle) {

    uploadTitle.textContent =
      'Tap untuk upload gambar';
  }


  if (uploadHint) {

    uploadHint.textContent =
      'JPG / PNG · Max 3 MB';
  }


  const result =
    $('result');

  if (result) {

    result.classList.remove(
      'visible',
      'success',
      'error',
      'loading'
    );
  }


  clearDraft();

  updateCounters();

  updatePreview();

  toast(
    'Form berhasil direset',
    'success'
  );
}


/* ============================================================
   INPUT EVENTS
   ============================================================ */

function setupInputEvents() {

  const title =
    $('title');

  const body =
    $('body');

  const url =
    $('url');


  if (title) {

    title.addEventListener(
      'input',
      () => {

        updateCounters();

        updatePreview();

        saveDraft();
      }
    );
  }


  if (body) {

    body.addEventListener(
      'input',
      () => {

        updateCounters();

        updatePreview();

        saveDraft();
      }
    );
  }


  if (url) {

    url.addEventListener(
      'input',
      () => {

        updatePreview();

        saveDraft();
      }
    );
  }
}


/* ============================================================
   CLOCK
   ============================================================ */

function startPreviewClock() {

  updatePreviewTime();

  setInterval(
    updatePreviewTime,
    30000
  );
}


/* ============================================================
   INIT
   ============================================================ */

function init() {

  const loginBtn =
    $('login-btn');

  const loginInput =
    $('admin-password');

  const logoutBtn =
    $('logout-btn');

  const sendBtn =
    $('btn-send');

  const resetBtn =
    $('reset-btn');


  if (
    !loginBtn ||
    !loginInput ||
    !logoutBtn ||
    !sendBtn
  ) {

    console.error(
      '[Admin] Element penting tidak ditemukan.'
    );

    return;
  }


  /* LOGIN — CEK DI SERVER */

  loginBtn.addEventListener(
    'click',
    async () => {

      const pwd =
        (loginInput.value || '').trim();

      if (!pwd) {

        $('login-error')
          ?.classList
          .add('visible');

        return;
      }

      loginBtn.disabled = true;

      loginBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Memeriksa...';

      try {

        const ok =
          await checkPasswordOnServer(pwd);

        if (ok) {

          setLoggedIn();

          $('login-error')
            ?.classList
            .remove('visible');

          loginInput.value = '';

          showPanel();

        } else {

          $('login-error')
            ?.classList
            .add('visible');

          loginInput.value = '';

          loginInput.focus();
        }

      } catch (e) {

        $('login-error')
          ?.classList
          .add('visible');

        toast(
          'Gagal menghubungi server',
          'error'
        );

      } finally {

        loginBtn.disabled = false;

        loginBtn.innerHTML =
          '<i class="fa-solid fa-right-to-bracket"></i> Masuk';
      }

    }
  );


  loginInput.addEventListener(
    'keydown',
    e => {

      if (e.key === 'Enter') {
        loginBtn.click();
      }

    }
  );


  /* LOGOUT */

  logoutBtn.addEventListener(
    'click',
    () => {

      clearLogin();

      showLogin();

    }
  );


  /* SEND */

  sendBtn.addEventListener(
    'click',
    sendNotif
  );


  /* RESET */

  if (resetBtn) {

    resetBtn.addEventListener(
      'click',
      resetForm
    );
  }


  /* IMAGE */

  setupImageUpload();


  /* INPUT */

  setupInputEvents();


  /* CLOCK */

  startPreviewClock();


  /* INITIAL STATE */

  if (isLoggedIn()) {

    showPanel();

  } else {

    showLogin();

    setTimeout(
      () => loginInput.focus(),
      300
    );
  }
}


/* ============================================================
   START
   ============================================================ */

if (
  document.readyState === 'loading'
) {

  document.addEventListener(
    'DOMContentLoaded',
    init
  );

} else {

  init();
}

})();