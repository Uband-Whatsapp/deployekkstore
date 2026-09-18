/* ============================================================
   EKK STORE 4.0 — COMMON.JS
   Berisi: Gate Screen, Firebase, Auth, Utilities, Toast,
   Confirm Modal, Navigation, Sidebar Drawer, Tracking,
   PWA Install Flow, Bootstrap, Diagnostic
   ============================================================ */

/* ============================================================
   1) GATE SCREEN
   ============================================================ */
(function initGateScreen() {
    'use strict';

    const STORAGE_KEY = 'wa_gate_passed_v12';
    const GATE_EXPIRY_DAYS = 1;
    const VERIFY_DELAY_MS = 2200;

    const gateScreen   = document.getElementById('gate-screen');
    const btnFollowWA  = document.getElementById('btn-follow-wa');
    const btnConfirm   = document.getElementById('btn-confirm');
    const verifyMsgBox = document.getElementById('verify-msg-box');
    const verifyIcon   = document.getElementById('verify-icon');
    const verifyText   = document.getElementById('verify-text');
    const gDot1   = document.getElementById('g-dot1');
    const gDot2   = document.getElementById('g-dot2');
    const gDot3   = document.getElementById('g-dot3');
    const gLine1  = document.getElementById('g-line1');
    const gLine2  = document.getElementById('g-line2');
    const gLabel1 = document.getElementById('g-label1');
    const gLabel2 = document.getElementById('g-label2');
    const gLabel3 = document.getElementById('g-label3');
    const appShell = document.getElementById('app-shell');

    if (!gateScreen || !btnFollowWA || !btnConfirm) {
        // Halaman tanpa gate (jarang) — biarkan
        return;
    }

    let followClickCount = 0;
    let confirmAttempts = 0;
    let isVerifying = false;
    let gateRemoved = false;
    let hasClickedFollowOnce = false;
    let waitingForWhatsApp = false;

    function isAlreadyPassed() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (!data) return false;
            const parsed = JSON.parse(data);
            if (parsed.passed === true && parsed.expiresAt && Date.now() < parsed.expiresAt) {
                return true;
            }
            localStorage.removeItem(STORAGE_KEY);
            return false;
        } catch (e) { return false; }
    }

    function setPassed() {
        const expiresAt = Date.now() + (GATE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            passed: true,
            timestamp: Date.now(),
            expiresAt: expiresAt
        }));
    }

    function showApp() {
        gateScreen.classList.add('hidden');
        if (appShell) appShell.classList.add('visible');
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
    }

    function updateStep(step) {
        [gDot1, gDot2, gDot3].forEach(function (el) { if (el) el.classList.remove('active', 'done'); });
        [gLine1, gLine2].forEach(function (el) { if (el) el.classList.remove('done'); });
        [gLabel1, gLabel2, gLabel3].forEach(function (el) { if (el) el.classList.remove('active', 'done'); });

        if (step >= 1) {
            gDot1?.classList.add('done');
            gLabel1?.classList.add('done');
        }
        if (step >= 2) {
            gDot1?.classList.add('done');
            gDot2?.classList.add('active');
            gLine1?.classList.add('done');
            gLabel1?.classList.add('done');
            gLabel2?.classList.add('active');
        }
        if (step >= 3) {
            gDot1?.classList.add('done');
            gDot2?.classList.add('done');
            gDot3?.classList.add('done');
            gLine1?.classList.add('done');
            gLine2?.classList.add('done');
            gLabel1?.classList.add('done');
            gLabel2?.classList.add('done');
            gLabel3?.classList.add('done');
        }
    }

    function enableConfirm() {
        if (gateRemoved) return;
        btnConfirm.disabled = false;
        btnConfirm.removeAttribute('disabled');
        btnConfirm.classList.add('active');
        btnConfirm.setAttribute('aria-disabled', 'false');
        btnConfirm.style.pointerEvents = 'auto';
        btnConfirm.style.cursor = 'pointer';
        btnConfirm.style.opacity = '1';
        btnConfirm.style.visibility = 'visible';
        btnConfirm.textContent = 'Saya Sudah Follow';
        updateStep(2);
    }

    function resetConfirmButton() {
        btnConfirm.disabled = true;
        btnConfirm.setAttribute('disabled', 'disabled');
        btnConfirm.classList.remove('active');
        btnConfirm.setAttribute('aria-disabled', 'true');
        btnConfirm.style.pointerEvents = 'none';
        btnConfirm.style.cursor = 'default';
        btnConfirm.style.opacity = '';
        btnConfirm.style.visibility = 'visible';
        btnConfirm.textContent = 'Saya Sudah Follow';
    }

    function showVerify(type, html) {
        if (!verifyMsgBox) return;
        verifyMsgBox.style.display = 'flex';
        verifyMsgBox.className = 'gate-verify-msg ' + type;
        if (verifyIcon) {
            if (type === 'loading') {
                verifyIcon.innerHTML = '<span class="gate-spinner"></span>';
            } else if (type === 'error') {
                verifyIcon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
            } else if (type === 'success') {
                verifyIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            }
        }
        if (verifyText) verifyText.innerHTML = html;
    }

    function hideVerify() {
        if (verifyMsgBox) {
            verifyMsgBox.style.display = 'none';
            verifyMsgBox.className = 'gate-verify-msg';
        }
    }

    function startVerification() {
        if (isVerifying || gateRemoved) return;
        isVerifying = true;
        confirmAttempts++;
        btnConfirm.disabled = true;
        btnConfirm.classList.remove('active');
        btnConfirm.style.pointerEvents = 'none';
        showVerify('loading', 'Sistem sedang memverifikasi status follow kamu. Tunggu sebentar...');

        setTimeout(function () {
            if (followClickCount >= 1) {
                showVerify('success', 'Verifikasi berhasil. Terima kasih telah mengikuti saluran WhatsApp. Mengalihkan...');
                updateStep(3);
                btnConfirm.style.visibility = 'hidden';
                btnConfirm.style.pointerEvents = 'none';
                setPassed();
                gateRemoved = true;
                isVerifying = false;
                setTimeout(function () { showApp(); }, 500);
                return;
            }
            showVerify('error',
                '<b>Verifikasi gagal.</b><br>' +
                'Kami belum mendeteksi bahwa kamu sudah mengikuti saluran WhatsApp. ' +
                'Silakan klik <b>Buka Saluran WhatsApp</b> sekali lagi, ' +
                'pastikan kamu sudah menekan <b>Ikuti</b>, lalu tekan ' +
                '<b>Coba Lagi</b>.');
            btnConfirm.disabled = false;
            btnConfirm.classList.add('active');
            btnConfirm.style.pointerEvents = 'auto';
            btnConfirm.style.cursor = 'pointer';
            btnConfirm.textContent = 'Coba Lagi';
            updateStep(2);
            isVerifying = false;
        }, VERIFY_DELAY_MS);
    }

    btnFollowWA.addEventListener('click', function () {
        waitingForWhatsApp = true;
        followClickCount++;
        console.log('[GATE] WhatsApp click:', followClickCount);
    });

    document.addEventListener('visibilitychange', function () {
        if (document.hidden && waitingForWhatsApp) {
            waitingForWhatsApp = false;
            if (!hasClickedFollowOnce) {
                hasClickedFollowOnce = true;
                enableConfirm();
            }
            if (followClickCount >= 1 && confirmAttempts >= 1 && !gateRemoved) {
                hideVerify();
                btnConfirm.textContent = 'Coba Lagi';
                btnConfirm.disabled = false;
                btnConfirm.classList.add('active');
                btnConfirm.style.pointerEvents = 'auto';
                updateStep(2);
            }
        }
    });

    btnConfirm.addEventListener('click', function (e) {
        e.preventDefault();
        if (btnConfirm.disabled || isVerifying || gateRemoved) return;
        if (!hasClickedFollowOnce) return;
        startVerification();
    });

    function init() {
        if (isAlreadyPassed()) {
            gateRemoved = true;
            showApp();
            return;
        }
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        hideVerify();
        resetConfirmButton();
        updateStep(0);
        gDot1?.classList.add('active');
        gLabel1?.classList.add('active');
        console.log('[GATE] Siap. Klik WhatsApp pertama untuk mengaktifkan tombol.');
    }

    init();
})();

/* ============================================================
   2) GLOBAL STATE
   ============================================================ */
let CURRENT_USER_ID = null;
let isDeploying = false;
let deployCompleted = false;
let currentPage = (document.body && document.body.dataset && document.body.dataset.page) || 'home';
let historyFilter = 'all';
let historySearch = '';
let _appInitialized = false;

// Sync ke window juga biar module lain bisa akses
window.currentPage = currentPage;

// Cache history dari Firestore
let _historyCache = [];
let _historyUnsubscribe = null;

const DEPLOY_STATE = {
    IDLE: 'idle',
    VALIDATING: 'validating',
    UPLOADING: 'uploading',
    DEPLOYING: 'deploying',
    SUCCESS: 'success',
    FAILED: 'failed'
};
let deployState = DEPLOY_STATE.IDLE;

window._pendingDeploy = null;

const LARGE_FILE_THRESHOLD = 25 * 1024 * 1024;

/* ============================================================
   3) FIREBASE CONFIG + INIT
   ============================================================ */
const firebaseConfig = {
    apiKey: "AIzaSyCesmK4pK1sv48Z9EkYDapH7GXRf7BeOkA",
    authDomain: "deploy-ekkstore.firebaseapp.com",
    projectId: "deploy-ekkstore",
    storageBucket: "deploy-ekkstore.firebasestorage.app",
    messagingSenderId: "715346814022",
    appId: "1:715346814022:web:e7c6091481347538c2d647",
    measurementId: "G-667XX2R18N"
};

let _firebaseReady = false;
let _firebaseAuthReady = false;

function getLegacyLocalUid() {
    let uid = localStorage.getItem('ekk_userId');
    if (!uid) {
        uid = 'user_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
        localStorage.setItem('ekk_userId', uid);
    }
    return uid;
}

function initFirebase() {
    if (typeof firebase === 'undefined') {
        console.error('[Firebase] SDK belum di-load!');
        return false;
    }
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();
    window._db = db;
    _firebaseReady = true;
    console.log('[Firebase] Init OK');
    return true;
}

function initAuth() {
    return new Promise((resolve) => {
        if (typeof firebase === 'undefined' || !firebase.auth) {
            CURRENT_USER_ID = getLegacyLocalUid();
            console.warn('[Auth] Firebase Auth tidak tersedia, fallback ke localStorage UID');
            resolve();
            return;
        }
        const auth = firebase.auth();
        let resolved = false;

        const unsub = auth.onAuthStateChanged(async (user) => {
            if (resolved) return;

            if (!user) {
                try {
                    await auth.signInAnonymously();
                } catch (e) {
                    console.warn('[Auth] Anonymous sign-in gagal:', e.message);
                    console.warn('[Auth] Fallback ke localStorage UID (mode terbatas)');
                    CURRENT_USER_ID = getLegacyLocalUid();
                    resolved = true;
                    unsub();
                    resolve();
                }
                return;
            }

            CURRENT_USER_ID = user.uid;
            localStorage.setItem('ekk_authUid', user.uid);
            _firebaseAuthReady = true;
            resolved = true;
            unsub();
            console.log('[Auth] Signed in uid:', user.uid);
            resolve();
        });

        setTimeout(() => {
            if (!resolved) {
                console.warn('[Auth] Timeout, fallback ke localStorage UID');
                CURRENT_USER_ID = CURRENT_USER_ID || getLegacyLocalUid();
                resolved = true;
                try { unsub(); } catch(e) {}
                resolve();
            }
        }, 5000);
    });
}

/* ============================================================
   4) UTILITIES
   ============================================================ */
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
    return escapeHTML(str);
}

function isValidHttpUrl(str) {
    if (!str || typeof str !== 'string') return false;
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch (e) {
        return false;
    }
}

function safeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    if (!isValidHttpUrl(url)) return '';
    return url;
}

function debounce(fn, wait) {
    let t;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

function getMyUid() {
    return CURRENT_USER_ID || getLegacyLocalUid();
}

/* ============================================================
   5) TOAST
   ============================================================ */
function showToast(msg, type) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    let icon = '';
    if (type === 'success') {
        icon = '<i class="fa-solid fa-circle-check" style="color:var(--success);"></i>';
    } else if (type === 'error') {
        icon = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger);"></i>';
    } else if (type === 'warning') {
        icon = '<i class="fa-solid fa-triangle-exclamation" style="color:var(--warning);"></i>';
    } else {
        icon = '<i class="fa-solid fa-circle-info" style="color:var(--accent);"></i>';
    }
    toast.innerHTML = icon + ' ' + escapeHTML(msg);
    toast.style.whiteSpace = 'nowrap';
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2600);
}

/* ============================================================
   6) CONFIRM MODAL
   ============================================================ */
function showConfirmModal(title, message, confirmText) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('confirm-modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const confirmBtn = document.getElementById('modal-confirm-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        if (!overlay || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
            resolve(false);
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmText || 'Hapus';
        overlay.classList.add('active');

        function cleanup(result) {
            overlay.classList.remove('active');
            cancelBtn.removeEventListener('click', onCancel);
            confirmBtn.removeEventListener('click', onConfirm);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        }
        function onCancel() { cleanup(false); }
        function onConfirm() { cleanup(true); }
        function onKey(e) {
            if (e.key === 'Escape') cleanup(false);
            if (e.key === 'Enter') cleanup(true);
        }
        cancelBtn.addEventListener('click', onCancel);
        confirmBtn.addEventListener('click', onConfirm);
        document.addEventListener('keydown', onKey);
        setTimeout(() => cancelBtn.focus(), 100);
    });
}

/* ============================================================
   7) NAVIGATION
   Karena sekarang multi-page, navigateTo() = pindah halaman.
   ============================================================ */
let _savedChatScrollTop = 0;
let _savedChatWasNearBottom = true;

function navigateTo(page) {
    // Simpan posisi chat sebelum keluar
    if (currentPage === 'group') {
        const list = document.getElementById('messages-list');
        if (list) {
            _savedChatScrollTop = list.scrollTop;
            _savedChatWasNearBottom = (list.scrollHeight - list.scrollTop - list.clientHeight) < 150;
            try {
                sessionStorage.setItem('ekk_chat_scroll_top', String(_savedChatScrollTop));
                sessionStorage.setItem('ekk_chat_near_bottom', _savedChatWasNearBottom ? '1' : '0');
            } catch (e) {}
        }
    }
    // Stop typing kalau keluar dari grup
    if (page !== 'group') {
        if (window.EkkChat && typeof window.EkkChat.stopTyping === 'function') {
            window.EkkChat.stopTyping();
        }
    }
    // Pindah halaman
    const target = (page === 'home' || !page) ? '/' : '/' + page;
    if (window.location.pathname !== target) {
        window.location.href = target;
    }
}
window.navigateTo = navigateTo;

/* ---------- Mobile Drawer helpers ---------- */
function openSidebarDrawer() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;
    sidebar.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    document.body.classList.add('drawer-open');
}

function closeSidebarDrawer() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    if (!sidebar) return;
    sidebar.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    document.body.classList.remove('drawer-open');
}

function setupNavigationEvents() {
    document.querySelectorAll('.sidebar-item[data-page]').forEach(item => {
        item.addEventListener('click', function() {
            navigateTo(this.dataset.page);
        });
    });
    document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
        item.addEventListener('click', function() {
            navigateTo(this.dataset.page);
        });
    });
    document.querySelectorAll('.quick-action[data-page]').forEach(item => {
        item.addEventListener('click', function() {
            navigateTo(this.dataset.page);
        });
    });
    document.querySelectorAll('.btn[data-page]').forEach(item => {
        item.addEventListener('click', function() {
            navigateTo(this.dataset.page);
        });
    });
    document.querySelectorAll('.sidebar-item.accordion-trigger').forEach(item => {
        item.addEventListener('click', function() {
            const submenuId = this.dataset.accordion;
            const submenu = document.getElementById(submenuId);
            if (submenu) {
                submenu.classList.toggle('open');
                this.classList.toggle('open');
            }
        });
    });
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', function() {
            const contentId = this.dataset.accordion;
            const content = document.getElementById(contentId);
            if (content) {
                content.classList.toggle('open');
                this.classList.toggle('open');
            }
        });
    });

    const btnHam = document.getElementById('btn-hamburger');
    if (btnHam) btnHam.addEventListener('click', openSidebarDrawer);

    const btnClose = document.getElementById('sidebar-close');
    if (btnClose) btnClose.addEventListener('click', closeSidebarDrawer);

    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeSidebarDrawer);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeSidebarDrawer();
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            document.body.classList.remove('modal-open');
            window._pendingDeploy = null;
        }
    });

    // Set active state sesuai halaman sekarang
    document.querySelectorAll('.sidebar-item[data-page]').forEach(item => {
        item.classList.toggle('active', item.dataset.page === currentPage);
    });
    document.querySelectorAll('.bottom-nav-item[data-page]').forEach(item => {
        item.classList.toggle('active', item.dataset.page === currentPage);
    });
}

/* ============================================================
   8) HISTORY LISTENER (dipakai banyak halaman)
   ============================================================ */
async function saveHistory(project, status, url, projectId, deploymentId) {
    const db = window._db;
    if (!db) {
        console.warn('[saveHistory] DB belum siap');
        return false;
    }
    const uid = getMyUid();
    const projectName = (project || '').toLowerCase().trim();

    try {
        const snap = await db.collection('projects')
            .where('ownerUid', '==', uid)
            .where('projectName', '==', projectName)
            .limit(1)
            .get();

        const payload = {
            projectName: projectName,
            ownerUid: uid,
            url: url || '',
            status: status,
            projectId: projectId || '',
            deploymentId: deploymentId || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!snap.empty) {
            await snap.docs[0].ref.update(payload);
            console.log('[saveHistory] Updated:', projectName);
        } else {
            payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('projects').add(payload);
            console.log('[saveHistory] Created:', projectName);
        }
        return true;
    } catch (e) {
        console.error('[saveHistory] Error:', e);
        return false;
    }
}

function startHistoryListener() {
    const db = window._db;
    if (!db) {
        console.warn('[History] DB belum siap');
        return;
    }
    if (_historyUnsubscribe) {
        try { _historyUnsubscribe(); } catch(e) {}
        _historyUnsubscribe = null;
    }
    const uid = getMyUid();
    console.log('[History] Listening for uid:', uid);

    _historyUnsubscribe = db.collection('projects')
        .where('ownerUid', '==', uid)
        .onSnapshot(snap => {
            _historyCache = snap.docs
                .map(doc => {
                    const d = doc.data();
                    const ts = d.createdAt?.toDate?.() || new Date();
                    return {
                        id: doc.id,
                        project: d.projectName || '',
                        status: d.status || 'unknown',
                        url: d.url || '',
                        projectId: d.projectId || '',
                        deploymentId: d.deploymentId || '',
                        ownerId: d.ownerUid || '',
                        date: ts.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }),
                        time: ts.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                        _ts: ts.getTime()
                    };
                })
                .sort((a, b) => b._ts - a._ts)
                .slice(0, 50);

            // Render kalau halaman yang butuh renderHistory aktif
            if (typeof renderHistory === 'function') renderHistory();
            if (typeof updateDashboardStats === 'function') updateDashboardStats();
        }, err => {
            console.error('[History] Listener error:', err);
        });
}

function getHistory() {
    return _historyCache;
}

async function checkProjectAvailability(projectName) {
    const db = window._db;
    if (!db) {
        console.warn('[checkProjectAvailability] DB belum siap');
        return { available: true, owned: false, checkFailed: true, error: 'DB not ready' };
    }
    const uid = getMyUid();
    const name = (projectName || '').toLowerCase().trim();

    try {
        const snap = await db.collection('projects')
            .where('projectName', '==', name)
            .limit(1)
            .get();

        if (snap.empty) return { available: true, owned: false };

        const data = snap.docs[0].data();
        return {
            available: false,
            owned: data.ownerUid === uid,
            existing: data
        };
    } catch (e) {
        console.error('[checkProjectAvailability] Gagal query:', e.code, e.message);
        return {
            available: true,
            owned: false,
            checkFailed: true,
            error: e.code + ': ' + e.message
        };
    }
}

function copyURL(url) {
    if (!url) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('Link berhasil disalin', 'success');
        }).catch(() => {
            fallbackCopy(url);
        });
    } else {
        fallbackCopy(url);
    }
}

function fallbackCopy(url) {
    const textarea = document.createElement('textarea');
    textarea.value = url;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showToast('Link berhasil disalin', 'success');
    } catch (e) {
        showToast('Gagal menyalin link', 'error');
    }
    document.body.removeChild(textarea);
}

/* ============================================================
   9) TRACKING
   ============================================================ */
function getAnonId() {
    try {
        let id = localStorage.getItem('ekk_anon_id');
        if (!id) {
            id = 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
            localStorage.setItem('ekk_anon_id', id);
        }
        return id;
    } catch (e) {
        return 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
    }
}

const ANON_ID = getAnonId();

function getVisitorNumber() {
    try {
        let num = localStorage.getItem('ekk_visitor_num');
        if (!num) {
            num = Math.floor(10000 + Math.random() * 89999).toString();
            localStorage.setItem('ekk_visitor_num', num);
        }
        return num;
    } catch (e) {
        return Math.floor(10000 + Math.random() * 89999).toString();
    }
}

const VISITOR_NUM = getVisitorNumber();

const VAPID_PUBLIC_KEY = 'BPXIBP6nsxkkYmrHpkkBQsZDwVnnyAYKbGupNOTls_HcOQVC39iI0eLHJtx4qGv5AJHmDYNnxz5PeE6fYZ3BINk';

async function registerPushNotification() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('Browser tidak mendukung notifikasi push.');
        return;
    }
    let permission = Notification.permission;
    if (permission === 'default') {
        permission = await Notification.requestPermission();
    }
    if (typeof updateModalStatus === 'function') updateModalStatus();
    if (permission !== 'granted') {
        console.log('Izin notifikasi ditolak.');
        return;
    }
    try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        console.log('Service Worker terdaftar');
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_PUBLIC_KEY
        });
        const anonId = localStorage.getItem('ekk_anon_id') || 'anon_' + Date.now().toString(36);
        await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ anonId: anonId, subscription: subscription })
        });
        console.log('Subscription berhasil disimpan.');
        showToast('Notifikasi diaktifkan', 'success');
    } catch (err) {
        console.error('Gagal daftar push:', err);
    }
}

function getBrowser() {
    try {
        const ua = navigator.userAgent || '';
        if (ua.includes('Edg/')) return 'Edge';
        if (ua.includes('OPR/')) return 'Opera';
        if (ua.includes('Chrome/')) return 'Chrome';
        if (ua.includes('Firefox/')) return 'Firefox';
        if (ua.includes('Safari/')) return 'Safari';
        return 'Unknown';
    } catch (e) { return 'Unknown'; }
}

function getOS() {
    try {
        const ua = navigator.userAgent || '';
        if (ua.includes('Android')) return 'Android';
        if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
        if (ua.includes('Windows')) return 'Windows';
        if (ua.includes('Mac OS')) return 'macOS';
        if (ua.includes('Linux')) return 'Linux';
        return 'Unknown';
    } catch (e) { return 'Unknown'; }
}

function getDeviceBrand() {
    try {
        if (navigator.userAgentData && navigator.userAgentData.brands) {
            const brands = navigator.userAgentData.brands;
            const fullBrand = brands.find(b => !b.brand.includes('Chromium') && !b.brand.includes('Google') && !b.brand.includes('Microsoft'));
            if (fullBrand && fullBrand.brand) return fullBrand.brand.trim();
        }
        const ua = (navigator.userAgent || '').toLowerCase();
        const brandList = ['samsung', 'xiaomi', 'redmi', 'oppo', 'vivo', 'realme', 'huawei', 'iphone', 'pixel', 'oneplus', 'asus', 'infinix', 'tecno', 'nokia', 'motorola'];
        for (const brand of brandList) {
            if (ua.includes(brand)) return brand.charAt(0).toUpperCase() + brand.slice(1);
        }
        return 'Unknown';
    } catch (e) { return 'Unknown'; }
}

async function getDeviceInfo() {
    const info = {
        brand: getDeviceBrand(),
        os: getOS(),
        browser: getBrowser(),
        platform: navigator.platform || 'unknown',
        language: navigator.language || 'unknown',
        screen: (window.screen ? window.screen.width : 0) + 'x' + (window.screen ? window.screen.height : 0),
        pixelRatio: window.devicePixelRatio || 1,
        cores: navigator.hardwareConcurrency || 'unknown',
        memory: navigator.deviceMemory || 'unknown',
        battery: null,
        network: null
    };
    try {
        if (navigator.getBattery) {
            const battery = await navigator.getBattery();
            info.battery = {
                level: Math.round(battery.level * 100),
                charging: battery.charging,
                chargingTime: battery.chargingTime,
                dischargingTime: battery.dischargingTime
            };
        }
    } catch (e) { info.battery = null; }
    try {
        if (navigator.connection) {
            info.network = {
                effectiveType: navigator.connection.effectiveType || 'unknown',
                downlink: navigator.connection.downlink || null,
                rtt: navigator.connection.rtt || null
            };
        }
    } catch (e) { info.network = null; }
    return info;
}

async function sendEventToBackend(eventType) {
    try {
        let deviceInfo = {};
        try { deviceInfo = await getDeviceInfo(); } catch (e) {}
        await fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                anonId: ANON_ID,
                visitorNumber: VISITOR_NUM,
                eventType: eventType,
                timestamp: new Date().toISOString(),
                deviceInfo: deviceInfo
            })
        });
    } catch (error) {
        console.warn('Gagal mengirim event:', error.message);
    }
}

function recordFollowPassed() { sendEventToBackend('follow_passed'); }
function recordDeployEntered() { /* reserved */ }

(function trackPageVisit() {
    try {
        const visitedKey = 'ekk_visit_sent_' + ANON_ID;
        if (!localStorage.getItem(visitedKey)) {
            sendEventToBackend('visit');
            localStorage.setItem(visitedKey, '1');
        }
    } catch (e) {
        console.warn('Gagal mencatat kunjungan:', e.message);
    }
})();

/* ============================================================
   10) PWA INSTALL FLOW — V14
   ============================================================ */
(function initPWAInstallFlow() {
    'use strict';

    const INSTALL_KEY = 'ekk_pwa_installed_v1';
    const PROMPT_READY_KEY = 'ekk_pwa_prompt_ready_v1';
    const RETRY_INTERVAL_MS = 4000;
    const OPTIMISTIC_TIMEOUT_MS = 3000;

    let deferredPrompt = null;
    let popupShown = false;
    let apiCheckResult = null;
    let retryInterval = null;

    let dismissedThisLoad = false;
    let pendingPopup = false;

    let optimisticReady = false;
    let optimisticTimer = null;

    function isStandalone() {
        if (window.matchMedia('(display-mode: standalone)').matches) return true;
        if (window.navigator.standalone === true) return true;
        if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
        return false;
    }

    function hasInstallFlag() {
        try { return localStorage.getItem(INSTALL_KEY) === '1'; }
        catch (e) { return false; }
    }

    function hasPromptReadyFlag() {
        try { return localStorage.getItem(PROMPT_READY_KEY) === '1'; }
        catch (e) { return false; }
    }

    function setPromptReadyFlag() {
        try { localStorage.setItem(PROMPT_READY_KEY, '1'); } catch(e) {}
    }

    function clearPromptReadyFlag() {
        try { localStorage.removeItem(PROMPT_READY_KEY); } catch(e) {}
    }

    function isInstalled() {
        if (isStandalone()) return true;
        if (apiCheckResult === true) return true;
        if (hasInstallFlag()) return true;
        return false;
    }

    async function checkGetInstalledRelatedApps() {
        if (!('getInstalledRelatedApps' in navigator)) {
            apiCheckResult = false;
            return false;
        }
        try {
            const apps = await navigator.getInstalledRelatedApps();
            if (apps && apps.length > 0) {
                apiCheckResult = true;
                try { localStorage.setItem(INSTALL_KEY, '1'); } catch(e) {}
                return true;
            } else {
                apiCheckResult = false;
                try { localStorage.removeItem(INSTALL_KEY); } catch(e) {}
                return false;
            }
        } catch (e) {
            apiCheckResult = null;
            return false;
        }
    }

    function isOnDownloadPage() {
        if (typeof window.currentPage !== 'undefined' && window.currentPage === 'download') return true;
        const page = document.getElementById('page-download');
        if (page && page.classList.contains('active')) return true;
        return false;
    }

    function updateDownloadPageUI() {
        const btn = document.getElementById('dl-install-btn');
        const btnText = document.getElementById('dl-install-text');
        const badge = document.getElementById('dl-installed-badge');
        if (!btn) return;

        if (isInstalled()) {
            btn.style.display = 'none';
            btn.disabled = true;
            if (badge) badge.classList.add('visible');
            return;
        }

        btn.style.display = 'inline-flex';
        if (badge) badge.classList.remove('visible');

        if (deferredPrompt || optimisticReady) {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = 'pointer';
            if (btnText) {
                btnText.textContent = 'Install Sekarang';
                const spinner = btn.querySelector('.gate-spinner');
                if (spinner) spinner.remove();
            }
            return;
        }

        btn.disabled = true;
        btn.style.opacity = '0.75';
        btn.style.cursor = 'wait';
        if (btnText) {
            btnText.textContent = 'Menyiapkan Install...';
            if (!btn.querySelector('.gate-spinner')) {
                const spinner = document.createElement('span');
                spinner.className = 'gate-spinner';
                spinner.style.cssText = 'width:14px;height:14px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;display:inline-block;margin-right:6px;';
                btn.insertBefore(spinner, btnText);
            }
        }
    }

    function enterOptimisticMode() {
        if (deferredPrompt || optimisticReady || isInstalled()) return;
        console.log('[PWA] Enter OPTIMISTIC mode (tab baru)');
        optimisticReady = true;
        updateDownloadPageUI();

        clearTimeout(optimisticTimer);
        optimisticTimer = setTimeout(() => {
            if (!deferredPrompt) {
                console.log('[PWA] Optimistic timeout — fallback to Menyiapkan');
                optimisticReady = false;
                updateDownloadPageUI();
            }
        }, OPTIMISTIC_TIMEOUT_MS);
    }

    function exitOptimisticMode() {
        optimisticReady = false;
        clearTimeout(optimisticTimer);
        optimisticTimer = null;
    }

    function tryShowPopup() {
        if (!deferredPrompt) return false;
        if (isInstalled()) return false;
        if (dismissedThisLoad) return false;
        if (isOnDownloadPage()) {
            pendingPopup = true;
            return false;
        }
        if (popupShown) return false;
        pendingPopup = false;
        showPopup();
        return true;
    }

    function startBackgroundRetry() {
        if (retryInterval) return;
        retryInterval = setInterval(async () => {
            if (deferredPrompt || isInstalled()) {
                clearInterval(retryInterval);
                retryInterval = null;
                return;
            }
            try {
                window.scrollBy(0, 1);
                setTimeout(() => window.scrollBy(0, -1), 50);
                const evt = new MouseEvent('mousemove', {
                    bubbles: true,
                    clientX: window.innerWidth / 2,
                    clientY: window.innerHeight / 2
                });
                document.dispatchEvent(evt);
            } catch (e) { /* silent */ }
            await checkGetInstalledRelatedApps();
            updateDownloadPageUI();
        }, RETRY_INTERVAL_MS);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('[PWA] ✅ READY — beforeinstallprompt fired');
        e.preventDefault();
        deferredPrompt = e;
        setPromptReadyFlag();
        exitOptimisticMode();

        if (retryInterval) {
            clearInterval(retryInterval);
            retryInterval = null;
        }
        updateDownloadPageUI();
        setTimeout(() => { tryShowPopup(); }, 500);
    });

    window.addEventListener('appinstalled', () => {
        console.log('[PWA] appinstalled → SET INSTALLED');
        try { localStorage.setItem(INSTALL_KEY, '1'); } catch(e) {}
        apiCheckResult = true;
        deferredPrompt = null;
        exitOptimisticMode();
        hidePopup();
        updateDownloadPageUI();
        if (typeof window.showToast === 'function') {
            window.showToast('Ekk Store berhasil diinstall! 🎉', 'success');
        }
    });

    async function triggerInstall() {
        if (isInstalled()) {
            updateDownloadPageUI();
            if (typeof window.showToast === 'function') {
                window.showToast('Ekk Store sudah terinstall', 'info');
            }
            return;
        }

        if (!deferredPrompt && optimisticReady) {
            if (typeof window.showToast === 'function') {
                window.showToast('Menyiapkan... tunggu sebentar.', 'info');
            }
            setTimeout(() => {
                if (deferredPrompt) {
                    triggerInstall();
                } else {
                    exitOptimisticMode();
                    updateDownloadPageUI();
                }
            }, 1500);
            return;
        }

        if (deferredPrompt && typeof deferredPrompt.prompt === 'function') {
            const promptRef = deferredPrompt;
            deferredPrompt = null;

            try {
                promptRef.prompt();
                const choice = await Promise.race([
                    promptRef.userChoice.then(c => c.outcome),
                    new Promise(r => setTimeout(() => r('__timeout__'), 5000))
                ]);

                if (choice === 'accepted') {
                    try { localStorage.setItem(INSTALL_KEY, '1'); } catch(e) {}
                    apiCheckResult = true;
                    updateDownloadPageUI();
                    if (typeof window.showToast === 'function') {
                        window.showToast('Berhasil! Cek home screen HP.', 'success');
                    }
                } else if (choice === 'dismissed') {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Install dibatalkan', 'info');
                    }
                    startBackgroundRetry();
                } else {
                    if (typeof window.showToast === 'function') {
                        window.showToast('Ikuti dialog Chrome yang muncul', 'info');
                    }
                }
            } catch (e) {
                console.warn('[PWA] prompt error:', e);
            } finally {
                updateDownloadPageUI();
            }
            return;
        }

        if (typeof window.showToast === 'function') {
            window.showToast('Chrome sedang menyiapkan. Tunggu sambil scroll halaman ini.', 'info');
        }
        if (!retryInterval) startBackgroundRetry();
    }

    function showPopup() {
        const overlay = document.getElementById('pwa-popup-overlay');
        if (!overlay) return;
        if (isInstalled()) return;
        if (!deferredPrompt) return;
        if (isOnDownloadPage()) return;
        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        popupShown = true;
    }

    function hidePopup() {
        const overlay = document.getElementById('pwa-popup-overlay');
        if (!overlay) return;
        overlay.classList.remove('active');
        const otherActive = document.querySelector('.modal-overlay.active')
            || document.getElementById('attach-menu-overlay')?.classList.contains('active');
        if (!otherActive) document.body.classList.remove('modal-open');
    }

    async function bindEvents() {
        await checkGetInstalledRelatedApps();
        updateDownloadPageUI();

        if (!deferredPrompt && !isInstalled() && hasPromptReadyFlag()) {
            console.log('[PWA] Prompt ready flag found → enter optimistic mode');
            enterOptimisticMode();
        }

        if (!deferredPrompt && !isInstalled()) {
            startBackgroundRetry();
        }

        const dlBtn = document.getElementById('dl-install-btn');
        if (dlBtn) dlBtn.addEventListener('click', triggerInstall);

        const gotoBtn = document.getElementById('pwa-popup-goto-download');
        if (gotoBtn) {
            gotoBtn.addEventListener('click', () => {
                dismissedThisLoad = true;
                hidePopup();
                if (typeof window.navigateTo === 'function') {
                    window.navigateTo('download');
                } else {
                    const menuBtn = document.querySelector('[data-page="download"]');
                    if (menuBtn) menuBtn.click();
                }
                setTimeout(updateDownloadPageUI, 300);
            });
        }

        const laterBtn = document.getElementById('pwa-popup-later');
        if (laterBtn) laterBtn.addEventListener('click', () => {
            dismissedThisLoad = true;
            hidePopup();
        });

        const closeBtn = document.getElementById('pwa-popup-close');
        if (closeBtn) closeBtn.addEventListener('click', () => {
            dismissedThisLoad = true;
            hidePopup();
        });

        const overlay = document.getElementById('pwa-popup-overlay');
        if (overlay) overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                dismissedThisLoad = true;
                hidePopup();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }

    if (typeof window.currentPage === 'undefined') {
        window.currentPage = 'home';
    }

    window.addEventListener('load', () => {
        setTimeout(() => {
            if (deferredPrompt && !isInstalled() && !dismissedThisLoad && !popupShown) {
                tryShowPopup();
            }
        }, 1000);
    });

    console.log('[PWA] Install flow V14 (optimistic tab-2) ready');
})();

/* ============================================================
   11) EXPOSE GLOBAL HELPERS
   ============================================================ */
window.recordFollowPassed = recordFollowPassed;
window.recordDeployEntered = recordDeployEntered;
window.getDeviceInfo = getDeviceInfo;
window.copyURL = copyURL;
window.showToast = showToast;
window.showConfirmModal = showConfirmModal;
window.escapeHTML = escapeHTML;

/* ============================================================
   12) APP INIT
   ============================================================ */
function initApp() {
    if (_appInitialized) return;
    _appInitialized = true;

    console.log('[App] Init dengan UID:', CURRENT_USER_ID);

    // Restore pending deploy
    try {
        const savedDeploy = localStorage.getItem('ekk_pending_deploy');
        if (savedDeploy) {
            console.log('[App] Restore pending deploy:', savedDeploy);
            window._pendingDeploy = savedDeploy;
            setTimeout(() => {
                if (window._pendingDeploy && typeof isJoinValid === 'function' && typeof getNotifStatus === 'function') {
                    if (isJoinValid() && getNotifStatus() && !isDeploying) {
                        if (typeof updateModalStatus === 'function') updateModalStatus();
                    }
                }
            }, 2000);
        }
    } catch(e) {}

    setupNavigationEvents();

    // Hook page-specific setup function kalau ada
    if (typeof setupPageSpecific === 'function') {
        try { setupPageSpecific(); } catch (e) { console.error('[App] setupPageSpecific error:', e); }
    }

    // Start history listener (semua halaman butuh untuk badge & stats)
    if (window._db) {
        startHistoryListener();
    } else {
        setTimeout(() => {
            if (window._db) startHistoryListener();
        }, 1000);
    }

    // Register SW
    if ('serviceWorker' in navigator) {
        if (document.readyState === 'complete') {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then(reg => console.log('[SW] Registered, scope:', reg.scope))
                .catch(err => console.warn('[SW] Register fail:', err));
        } else {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(reg => console.log('[SW] Registered, scope:', reg.scope))
                    .catch(err => console.warn('[SW] Register fail:', err));
            });
        }
    }

    if ('Notification' in window && Notification.permission === 'granted') {
        window.addEventListener('load', () => registerPushNotification().catch(() => {}));
    }

    console.log('EKK STORE 4.0 — Premium Deployment Platform');
    console.log('UID:', CURRENT_USER_ID, '| Auth:', _firebaseAuthReady ? 'Firebase' : 'Fallback');
}

/* ============================================================
   13) BOOTSTRAP
   ============================================================ */
(function bootstrap() {
    const ok = initFirebase();
    if (!ok) {
        console.warn('[Bootstrap] Firebase gagal, pakai fallback');
        CURRENT_USER_ID = getLegacyLocalUid();
        window.CURRENT_USER_ID = CURRENT_USER_ID;
        initApp();
        return;
    }

    initAuth().then(() => {
        if (!CURRENT_USER_ID) CURRENT_USER_ID = getLegacyLocalUid();
        window.CURRENT_USER_ID = CURRENT_USER_ID;
        console.log('[Bootstrap] UID exposed ke window:', window.CURRENT_USER_ID);
        initApp();
    }).catch(err => {
        console.error('[Bootstrap] Auth error:', err);
        if (!CURRENT_USER_ID) CURRENT_USER_ID = getLegacyLocalUid();
        window.CURRENT_USER_ID = CURRENT_USER_ID;
        initApp();
    });
})();

/* ============================================================
   14) DIAGNOSTIC
   ============================================================ */
window.diagnoseEkk = async function() {
    console.log('═══════════ EKK STORE DIAGNOSTIC ═══════════');
    console.log('1. Firebase SDK:', typeof firebase !== 'undefined' ? '✅ OK' : '❌ MISSING');
    console.log('2. Firebase apps:', firebase?.apps?.length || 0);
    console.log('3. window._db:', window._db ? '✅ SET' : '❌ MISSING');
    console.log('4. CURRENT_USER_ID:', CURRENT_USER_ID || '❌ null');
    console.log('5. window.CURRENT_USER_ID:', window.CURRENT_USER_ID || '❌ null');
    console.log('6. _firebaseAuthReady:', _firebaseAuthReady);

    if (typeof firebase !== 'undefined' && firebase.auth) {
        const user = firebase.auth().currentUser;
        console.log('7. Firebase Auth user:', user ? '✅ ' + user.uid : '❌ NULL');
        console.log('8. isAnonymous:', user?.isAnonymous);
    } else {
        console.log('7-8. Firebase Auth SDK: ❌ tidak load');
    }

    if (window._db) {
        console.log('9. Test read projects...');
        try {
            const snap = await window._db.collection('projects').limit(1).get();
            console.log('   ✅ Read OK, size:', snap.size);
        } catch (e) {
            console.error('   ❌ Read FAILED:', e.code, '-', e.message);
        }
        console.log('10. Test read users...');
        try {
            const snap = await window._db.collection('users').limit(1).get();
            console.log('    ✅ Read OK, size:', snap.size);
        } catch (e) {
            console.error('    ❌ Read FAILED:', e.code, '-', e.message);
        }
    }
    console.log('═══════════ END ═══════════');
};
console.log('%c💡 Ketik "diagnoseEkk()" di console untuk cek status sistem', 'color:#8b5cf6;font-weight:bold;font-size:12px;');