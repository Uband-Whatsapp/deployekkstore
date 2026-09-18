/* ============================================================
   EKK STORE — ADMIN.JS
   ============================================================ */
(function initAdminPanel() {
    'use strict';

    // ⚠️ GANTI dengan password yang sama dengan env ADMIN_PASSWORD di Vercel
    const ADMIN_PASSWORD = 'ekkstore2024admin';

    const CLOUDINARY_CLOUD_NAME = 'uuvl0m4s';
    const CLOUDINARY_UPLOAD_PRESET = 'Deploy-EkkStore';
    const STORAGE_KEY = 'ekk_admin_session_v1';
    const SESSION_DURATION = 12 * 60 * 60 * 1000;

    const DESIGN_PRESETS = {
        classic: { vibrate: [200, 100, 200], requireInteraction: false, tag: 'ekk-classic', fallbackIcon: 'fa-bullhorn' },
        promo:   { vibrate: [300, 100, 300, 100, 300], requireInteraction: true, tag: 'ekk-promo', fallbackIcon: 'fa-fire' },
        alert:   { vibrate: [500, 200, 500, 200, 500], requireInteraction: true, tag: 'ekk-alert', fallbackIcon: 'fa-triangle-exclamation' },
        minimal: { vibrate: [100], requireInteraction: false, tag: 'ekk-minimal', fallbackIcon: 'fa-circle-check' }
    };

    let currentDesign = 'classic';
    let uploadedImageUrl = '';

    function $(id) { return document.getElementById(id); }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function showToast(msg, type) {
        const toast = $('toast');
        if (!toast) return;
        let icon = '';
        if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color:var(--success);"></i>';
        else if (type === 'error') icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger);"></i>';
        else if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);"></i>';
        else icon = '<i class="fa-solid fa-circle-info" style="color:var(--accent);"></i>';
        toast.innerHTML = icon + ' ' + escapeHTML(msg);
        toast.classList.add('show');
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => toast.classList.remove('show'), 2600);
    }

    function showResult(type, text) {
        const box = $('admin-result');
        const icon = $('admin-result-icon');
        const txt = $('admin-result-text');
        if (!box || !icon || !txt) return;
        box.classList.remove('success', 'error', 'loading');
        box.classList.add('visible', type);
        if (type === 'loading') icon.innerHTML = '<span class="gate-spinner" style="width:14px;height:14px;"></span>';
        else if (type === 'success') icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        else if (type === 'error') icon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        txt.textContent = text;
    }

    function isSessionValid() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (!data) return false;
            const parsed = JSON.parse(data);
            if (parsed.expiresAt && Date.now() < parsed.expiresAt) return true;
            localStorage.removeItem(STORAGE_KEY);
            return false;
        } catch (e) { return false; }
    }

    function setSession() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ loggedInAt: Date.now(), expiresAt: Date.now() + SESSION_DURATION }));
        } catch (e) {}
    }

    function clearSession() {
        try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    }

    function showLogin() {
        if ($('admin-login')) $('admin-login').classList.remove('hidden');
        if ($('admin-panel')) $('admin-panel').classList.remove('visible');
        if ($('admin-header')) $('admin-header').style.display = 'none';
    }

    function showPanel() {
        if ($('admin-login')) $('admin-login').classList.add('hidden');
        if ($('admin-panel')) $('admin-panel').classList.add('visible');
        if ($('admin-header')) $('admin-header').style.display = 'flex';
        updateSubscriberCount();
    }

    function handleLogin() {
        const input = $('admin-password');
        const errorEl = $('admin-login-error');
        if (!input) return;
        const pwd = input.value.trim();
        if (pwd === ADMIN_PASSWORD) {
            setSession();
            if (errorEl) errorEl.classList.remove('visible');
            input.value = '';
            showPanel();
            showToast('Login berhasil', 'success');
        } else {
            if (errorEl) errorEl.classList.add('visible');
            input.value = '';
            input.focus();
            input.style.transform = 'translateX(-6px)';
            setTimeout(() => { input.style.transform = 'translateX(6px)'; }, 80);
            setTimeout(() => { input.style.transform = ''; }, 160);
        }
    }

    function handleLogout() {
        clearSession();
        showLogin();
        showToast('Logout berhasil', 'info');
    }

    async function updateSubscriberCount() {
        const countEl = $('subscriber-count');
        if (!countEl) return;
        try {
            const res = await fetch('/api/subscriber-count');
            if (!res.ok) throw new Error('fail');
            const data = await res.json();
            countEl.textContent = data.count || 0;
        } catch (e) {
            countEl.textContent = '—';
        }
    }

    function setupDesignSelector() {
        const buttons = document.querySelectorAll('.design-option');
        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                currentDesign = this.dataset.design;
                updatePreview();
            });
        });
    }

    function setupFormLiveUpdate() {
        const titleInput = $('notif-title');
        const bodyInput = $('notif-body');
        const urlInput = $('notif-url');
        if (titleInput) titleInput.addEventListener('input', function() {
            if ($('title-counter')) $('title-counter').textContent = this.value.length;
            updatePreview();
        });
        if (bodyInput) bodyInput.addEventListener('input', function() {
            if ($('body-counter')) $('body-counter').textContent = this.value.length;
            updatePreview();
        });
        if (urlInput) urlInput.addEventListener('input', updatePreview);
    }

    function setupImageUploader() {
        const uploader = $('notif-uploader');
        const input = $('notif-image-input');
        const removeBtn = $('notif-uploader-remove');
        const previewBox = $('notif-uploader-preview');
        const titleEl = $('notif-uploader-title');
        const hintEl = $('notif-uploader-hint');
        if (!uploader || !input) return;

        uploader.addEventListener('click', function(e) {
            if (e.target.closest('#notif-uploader-remove')) return;
            input.click();
        });
        uploader.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('dragover'); });
        uploader.addEventListener('dragleave', function() { this.classList.remove('dragover'); });
        uploader.addEventListener('drop', function(e) {
            e.preventDefault();
            this.classList.remove('dragover');
            if (e.dataTransfer.files[0]) {
                input.files = e.dataTransfer.files;
                handleImageUpload(e.dataTransfer.files[0]);
            }
        });
        input.addEventListener('change', function() {
            if (this.files && this.files[0]) handleImageUpload(this.files[0]);
        });
        if (removeBtn) removeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            uploadedImageUrl = '';
            input.value = '';
            uploader.classList.remove('has-image');
            previewBox.innerHTML = '<i class="fa-solid fa-image"></i>';
            titleEl.textContent = 'Tap untuk upload foto';
            hintEl.textContent = 'JPG / PNG · Max 3 MB';
            updatePreview();
        });

        async function handleImageUpload(file) {
            if (!file.type.startsWith('image/')) { showToast('Hanya file gambar', 'error'); return; }
            if (file.size > 3 * 1024 * 1024) { showToast('Max 3 MB', 'error'); return; }
            const reader = new FileReader();
            reader.onload = function(e) { previewBox.innerHTML = '<img src="' + e.target.result + '" alt="">'; };
            reader.readAsDataURL(file);
            titleEl.textContent = 'Mengupload...';
            hintEl.textContent = file.name + ' · ' + (file.size / 1024).toFixed(1) + ' KB';
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
                const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Upload gagal');
                const data = await res.json();
                uploadedImageUrl = data.secure_url;
                uploader.classList.add('has-image');
                titleEl.textContent = 'Foto terpasang';
                hintEl.textContent = 'Klik untuk ganti foto';
                updatePreview();
                showToast('Foto berhasil diupload', 'success');
            } catch (err) {
                titleEl.textContent = 'Upload gagal, coba lagi';
                hintEl.textContent = 'Tap untuk upload foto';
                previewBox.innerHTML = '<i class="fa-solid fa-image"></i>';
                uploadedImageUrl = '';
                updatePreview();
                showToast('Upload gagal: ' + err.message, 'error');
            }
        }
    }

    function updatePreview() {
        const title = ($('notif-title')?.value || '').trim();
        const body = ($('notif-body')?.value || '').trim();
        const url = ($('notif-url')?.value || '').trim();
        if ($('preview-title')) {
            $('preview-title').textContent = title || 'Judul notif akan muncul di sini';
            $('preview-title').style.opacity = title ? '1' : '0.4';
        }
        if ($('preview-desc')) {
            $('preview-desc').textContent = body || 'Isi notif akan muncul di sini. Tulis pesan yang singkat dan jelas.';
            $('preview-desc').style.opacity = body ? '1' : '0.4';
        }
        if ($('preview-image')) {
            if (uploadedImageUrl) $('preview-image').innerHTML = '<img src="' + escapeHTML(uploadedImageUrl) + '" alt="">';
            else {
                const preset = DESIGN_PRESETS[currentDesign] || DESIGN_PRESETS.classic;
                $('preview-image').innerHTML = '<i class="fa-solid ' + preset.fallbackIcon + '"></i>';
            }
        }
        if ($('preview-url')) {
            if (url) {
                let display = url.replace(/^https?:\/\//, '');
                if (display.length > 30) display = display.slice(0, 28) + '…';
                $('preview-url').style.display = 'inline-flex';
                $('preview-url').innerHTML = '<i class="fa-solid fa-link"></i><span>' + escapeHTML(display) + '</span>';
            } else {
                $('preview-url').style.display = 'none';
            }
        }
    }

    function validateForm() {
        const title = ($('notif-title')?.value || '').trim();
        const body = ($('notif-body')?.value || '').trim();
        const url = ($('notif-url')?.value || '').trim();
        if (!title) { showToast('Judul notif wajib diisi', 'error'); return null; }
        if (!body) { showToast('Isi notif wajib diisi', 'error'); return null; }
        if (!url) { showToast('URL tujuan wajib diisi', 'error'); return null; }
        try {
            const u = new URL(url);
            if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Protocol salah');
        } catch (e) { showToast('URL tidak valid', 'error'); return null; }
        return { title, body, url };
    }

    async function sendNotification(mode) {
        const formData = validateForm();
        if (!formData) return;
        const preset = DESIGN_PRESETS[currentDesign] || DESIGN_PRESETS.classic;
        const payload = {
            title: formData.title,
            body: formData.body,
            url: formData.url,
            icon: 'https://files.catbox.moe/kzg0nc.png',
            badge: 'https://files.catbox.moe/kzg0nc.png',
            image: uploadedImageUrl || '',
            tag: preset.tag,
            vibrate: preset.vibrate,
            requireInteraction: preset.requireInteraction,
            testMode: mode === 'test'
        };
        const btnSend = $('btn-send');
        const btnTest = $('btn-test');
        if (btnSend) btnSend.disabled = true;
        if (btnTest) btnTest.disabled = true;
        showResult('loading', mode === 'test' ? 'Mengirim test notif...' : 'Mengirim ke semua subscriber...');
        try {
            const res = await fetch('/api/send-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN_PASSWORD },
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);
            const sent = data.success || 0;
            const failed = data.failed || 0;
            const total = data.total || 0;
            const cleaned = data.cleaned || 0;
            if (mode === 'test') {
                if (sent > 0) {
                    showResult('success', '✓ Test notif terkirim! Cek HP Anda.');
                    showToast('Test notif terkirim', 'success');
                } else {
                    showResult('error', 'Test gagal: tidak ada subscriber aktif.');
                    showToast('Tidak ada subscriber', 'warning');
                }
            } else {
                let msg = `Notif terkirim ke ${sent}/${total} perangkat.`;
                if (failed > 0) msg += ` (${failed} gagal)`;
                if (cleaned > 0) msg += ` · ${cleaned} sub expired dibersihkan`;
                showResult('success', msg);
                showToast(`Terkirim ke ${sent} perangkat`, 'success');
            }
            setTimeout(updateSubscriberCount, 1000);
        } catch (err) {
            showResult('error', 'Gagal kirim: ' + err.message);
            showToast('Gagal kirim notif', 'error');
        } finally {
            if (btnSend) btnSend.disabled = false;
            if (btnTest) btnTest.disabled = false;
        }
    }

    function setupActions() {
        if ($('btn-send')) $('btn-send').addEventListener('click', () => sendNotification('all'));
        if ($('btn-test')) $('btn-test').addEventListener('click', () => sendNotification('test'));
    }

    function bootstrap() {
        const loginBtn = $('admin-login-btn');
        const loginInput = $('admin-password');
        const logoutBtn = $('admin-logout-btn');
        if (loginBtn) loginBtn.addEventListener('click', handleLogin);
        if (loginInput) loginInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') handleLogin(); });
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
        setupDesignSelector();
        setupFormLiveUpdate();
        setupImageUploader();
        setupActions();
        updatePreview();
        if (isSessionValid()) showPanel();
        else { showLogin(); setTimeout(() => $('admin-password')?.focus(), 300); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
    else bootstrap();

    console.log('[Admin] Dashboard siap');
})();