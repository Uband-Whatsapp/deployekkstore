/* ============================================================
   EKK STORE 4.0 — GROUP.JS
   Berisi: Chat module lengkap (WhatsApp-like)
   Firebase Auth + Firestore, pagination, incremental, typing,
   unread, search, member panel, link preview, camera, voice.
   Digunakan HANYA di /group (group/index.html)
   ============================================================ */
(function initChatModule() {
    'use strict';

    /* ============================================================
       GUARD MULTI-PAGE
       Kalau bukan di halaman grup (tidak ada #chat-container),
       langsung exit. Script tetap ter-load di HTML lain karena
       browser cache, tapi tidak menjalankan apa pun.
    ============================================================ */
    if (!document.getElementById('chat-container')) {
        // Expose stub EkkChat kosong biar kalau ada kode lain yang
        // manggil window.EkkChat tidak error.
        window.EkkChat = {
            initChat: function(){},
            checkUser: function(){},
            openMemberPanel: function(){},
            closeMemberPanel: function(){},
            openChatSearch: function(){},
            closeChatSearch: function(){},
            scrollToBottom: function(){},
            markRead: function(){},
            stopTyping: function(){},
            currentUser: null
        };
        return;
    }

    /* ============================================================
       CLOUDINARY
    ============================================================ */
    const CLOUDINARY_CLOUD_NAME = 'uuvl0m4s';
    const CLOUDINARY_UPLOAD_PRESET = 'Deploy-EkkStore';
/* Owner username yang boleh pin (case-insensitive) */
const OWNER_USERNAMES = ['ekkstore', 'ekk store'];
function isOwnerUser(username) {
    if (!username) return false;
    return OWNER_USERNAMES.includes(String(username).toLowerCase().trim());
}
    /* ============================================================
       STATE
    ============================================================ */
    const PAGE_SIZE = 200;       // buat pagination scroll ke atas (tetap)
const INITIAL_LOAD = 10;     // ← BARU: batas awal cuma 10 pesan
    const TYPING_DEBOUNCE = 1500;
    const TYPING_CLEANUP = 3500;
    const LINK_PREVIEW_CACHE_TTL = 1000 * 60 * 60;

    let currentUser = null;              // { uid, username, avatar }
    let _pendingAvatarUploadPromise = null;
    let messagesUnsubscribe = null;
    let usersUnsubscribe = null;
    let statusInterval = null;
    let replyingTo = null;
    let messagesObserver = null;
    let typingDebounceTimer = null;
    let typingCleanupTimer = null;

    // Pagination
    let oldestLoadedTs = Date.now();           // cursor untuk load lebih lama
    let hasMoreOldMessages = true;
    let isLoadingOlder = false;
    let initialLoadDone = false;

    // Incremental render
    const renderedMessages = new Map();  // docId -> HTMLElement
    let isUserNearBottom = true;
    let unreadCount = 0;

    // Search
    let chatSearchQuery = '';
    let chatSearchMatches = [];
    let chatSearchIndex = 0;
    let chatSearchActive = false;

    // Members
    let allUsersCache = [];              // [{uid, username, avatar, isOnline, lastSeen}]
    let memberPanelOpen = false;

    // Pending uploads
    let pendingFiles = [];
    let pendingMessages = [];            // untuk instant preview

    // User avatar cache (uid → { username, avatar, avatarUpdatedAt, avatarUpdatedAtMs })
    window._userAvatarCache = window._userAvatarCache || {};

    // Voice
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    let recordStartTime = 0;
    let recordTimerInterval = null;
    let recordCancelled = false;

    // Camera
    const inAppCamera = {
        stream: null,
        facingMode: 'environment',
        mode: 'photo',
        mediaRecorder: null,
        recordedChunks: [],
        isRecordingVideo: false,
        recordStartTime: 0,
        timerInterval: null
    };

    // Avatar upload state
    window._avatarUploadState = { setup: false, edit: false };
    let uploadedAvatarUrl = '';
    let newAvatarUrl = null;
    let editingMessageId = null;
    let editingMessageOldText = '';
// Pin state
let currentPinnedMessage = null;
let pinnedUnsubscribe = null;
    // Link preview cache (in-memory)
    const linkPreviewCache = new Map();
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    /* ============================================================
       HELPERS
    ============================================================ */
    function getDb() {
        return window._db || null;
    }

    function getMyUid() {
        return currentUser?.uid || window.CURRENT_USER_ID || null;
    }

    function escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isValidHttpUrl(str) {
        if (!str || typeof str !== 'string') return false;
        try {
            const u = new URL(str);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch (e) { return false; }
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

    function formatTime(ts) {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    }

    function formatDateLong(ts) {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleString('id-ID', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function formatDurationMs(ms) {
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m + ':' + (sec < 10 ? '0' : '') + sec;
    }
/* ============================================================
   DATE SEPARATOR
============================================================ */
function getDateKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
}

function formatDateSeparator(date) {
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.floor((today - target) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hari ini';
    if (diffDays === 1) return 'Kemarin';

    if (diffDays >= 2 && diffDays <= 6) {
        const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
        return days[d.getDay()];
    }

    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = months[d.getMonth()];
    const yyyy = d.getFullYear();

    if (yyyy === now.getFullYear()) {
        return dd + ' ' + mm;
    }
    return dd + ' ' + mm + ' ' + yyyy;
}

function buildDateSeparator(date) {
    const sep = document.createElement('div');
    sep.className = 'date-separator';
    sep.dataset.dateKey = getDateKey(date);
    const span = document.createElement('span');
    span.textContent = formatDateSeparator(date);
    sep.appendChild(span);
    return sep;
}

/* ============================================================
   REBUILD DATE SEPARATORS
   Hapus semua separator, rebuild dari awal berdasarkan message-item.
   Cuma 1 separator per hari, di pesan reguler pertama hari itu.
   System message di-skip.
============================================================ */
function rebuildDateSeparators(listEl) {
    if (!listEl) return;

    // 1. Hapus semua separator lama
    listEl.querySelectorAll('.date-separator').forEach(sep => sep.remove());

    // 2. Ambil semua message-item dalam urutan DOM
    const allMessages = Array.from(listEl.querySelectorAll('.message-item'));

    // 3. Loop dan tambah separator di tempat yang tepat
    let lastDateKey = null;

    allMessages.forEach(msg => {
        // Skip system message
        if (msg.dataset.isSystem === 'true') return;

        const ts = parseInt(msg.dataset.ts || '0', 10);
        if (!ts) return;

        const dateKey = getDateKey(new Date(ts));

        // Kalau beda hari dengan pesan sebelumnya → tambah separator
        if (dateKey !== lastDateKey) {
            const sep = buildDateSeparator(new Date(ts));
            listEl.insertBefore(sep, msg);
            lastDateKey = dateKey;
        }
    });
}
    function showToast(msg, type) {
        if (typeof window.showToast === 'function') window.showToast(msg, type);
    }

    function showConfirmModal(title, message, confirmText) {
        if (typeof window.showConfirmModal === 'function') {
            return window.showConfirmModal(title, message, confirmText);
        }
        return Promise.resolve(false);
    }

    /* ============================================================
       STORAGE — user cache
    ============================================================ */
    const GRP_STORAGE_KEY = 'ekk_group_user';

    function getStoredUser() {
        try {
            const data = localStorage.getItem(GRP_STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) { return null; }
    }

    function setStoredUser(user) {
        currentUser = user;
        try {
            localStorage.setItem(GRP_STORAGE_KEY, JSON.stringify(user));
        } catch (e) {}
    }

    /* ============================================================
       CLOUDINARY UPLOAD
    ============================================================ */
    async function uploadAvatarToCloudinary(file, uid) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const safeUid = (uid || 'anon').replace(/[^a-zA-Z0-9_-]/g, '');
        const uniqueId = `avatars/${safeUid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        formData.append('public_id', uniqueId);

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
            { method: 'POST', body: formData }
        );
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || 'Upload gagal');
        }
        const data = await response.json();
        return data.secure_url;
    }

    async function uploadMediaToCloudinary(file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        let resourceType = 'auto';
        if (file.type.startsWith('image/')) resourceType = 'image';
        else if (file.type.startsWith('video/')) resourceType = 'video';
        else resourceType = 'raw';

        const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
        const response = await fetch(url, { method: 'POST', body: formData });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || 'Upload gagal');
        }
        const data = await response.json();
        return data.secure_url;
    }

    /* ============================================================
       FIRESTORE — USER PROFILE
    ============================================================ */
    async function checkUsername(username) {
        const db = getDb();
        if (!db) return false;
        try {
            const lower = username.toLowerCase();
            const snap = await db.collection('users')
                .where('usernameLower', '==', lower)
                .limit(1)
                .get();
            return !snap.empty;
        } catch (e) {
            console.error('[checkUsername] Error:', e);
            return false;
        }
    }

    async function createProfile(uid, username, avatar) {
const db = getDb();
if (!db) return false;
try {
    const lowerUsername = username.toLowerCase().trim();
    const isOwnerFlag = (lowerUsername === 'ekkstore' || lowerUsername === 'ekk store');

    // 1. Buat user doc
    await db.collection('users').doc(uid).set({
        uid: uid,
        username: username,
        usernameLower: lowerUsername,
        avatar: avatar || '',
        avatarUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        avatarUpdatedAtMs: Date.now(),
        isOnline: true,
        isOwner: isOwnerFlag,   // ⬅️ TAMBAH INI
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });

        // 2. Kirim SYSTEM MESSAGE "bergabung" ke collection messages
        await db.collection('messages').add({
            type: 'join',              // penanda system message
            senderId: uid,             // biar bisa ngecek "punya gue atau bukan"
            username: username,
            avatar: avatar || '',
            text: '',                  // text di-kosongin, render via type
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        return true;
    } catch (e) {
        console.error('[createProfile] Error:', e);
        return false;
    }
}

    async function updateOnlineStatus(isOnline) {
        if (!currentUser) return;
        try {
            await fetch('/api/update-status', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: currentUser.uid, isOnline })
            });
        } catch (e) { /* silent */ }
    }

    async function updateUsername(uid, newUsername) {
        const db = getDb();
        if (!db) return { success: false, error: 'DB tidak tersedia' };
        try {
            const userDoc = await db.collection('users').doc(uid).get();
            if (!userDoc.exists) return { success: false, error: 'User tidak ditemukan' };

            const snapshot = await db.collection('users')
                .where('usernameLower', '==', newUsername.toLowerCase())
                .limit(1)
                .get();

            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                if (doc.id !== uid) {
                    return { success: false, error: 'Username sudah dipakai, silakan gunakan username lain' };
                }
            }

            // Update pesan lama (batched)
            let messagesSnapshot = await db.collection('messages')
                .where('senderId', '==', uid)
                .get();
            if (messagesSnapshot.empty) {
                messagesSnapshot = await db.collection('messages')
                    .where('uid', '==', uid)
                    .get();
            }

            if (!messagesSnapshot.empty) {
                const docs = messagesSnapshot.docs;
                const CHUNK_SIZE = 400;
                for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
                    const chunk = docs.slice(i, i + CHUNK_SIZE);
                    const batch = db.batch();
                    chunk.forEach((doc) => {
                        batch.update(doc.ref, { username: newUsername });
                    });
                    await batch.commit();
                }
            }

            await db.collection('users').doc(uid).update({
                username: newUsername,
                usernameLower: newUsername.toLowerCase(),
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            console.error('[updateUsername] Error:', error);
            return { success: false, error: error.message };
        }
    }

    async function updateAvatar(uid, newAvatarUrlIn) {
        const db = getDb();
        if (!db) return { success: false, error: 'DB tidak tersedia' };
        try {
            const userDoc = await db.collection('users').doc(uid).get();
            if (!userDoc.exists) return { success: false, error: 'User tidak ditemukan' };

            const oldAvatar = (userDoc.data().avatar || '').split('?')[0];
            const newAvatarClean = (newAvatarUrlIn || '').split('?')[0];

            if (!newAvatarClean) return { success: false, error: 'URL avatar kosong' };
            if (oldAvatar === newAvatarClean) {
                return { success: false, error: 'Foto tidak berubah. Coba pilih foto lain.' };
            }

            const messagesSnapshot = await db.collection('messages')
                .where('senderId', '==', uid)
                .get();
            if (!messagesSnapshot.empty) {
                const docs = messagesSnapshot.docs;
                const CHUNK_SIZE = 400;
                for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
                    const chunk = docs.slice(i, i + CHUNK_SIZE);
                    const batch = db.batch();
                    chunk.forEach((doc) => {
                        batch.update(doc.ref, {
                            avatar: newAvatarUrlIn,
                            avatarUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    await batch.commit();
                }
            }

            await db.collection('users').doc(uid).update({
                avatar: newAvatarUrlIn,
                avatarUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                avatarUpdatedAtMs: Date.now(),
                lastSeen: firebase.firestore.FieldValue.serverTimestamp()
            });

            return { success: true };
        } catch (error) {
            console.error('[updateAvatar] Error:', error);
            return { success: false, error: error.message };
        }
    }

    /* ============================================================
       FIRESTORE — MESSAGES
    ============================================================ */
    async function sendMessage(text, replyTo, media) {
        if (!currentUser) return false;

        let avatarToSend = currentUser.avatar || '';
        let usernameToSend = currentUser.username || '';

        // Ambil avatar terbaru
        const db = getDb();
        if (db) {
            try {
                const userDoc = await db.collection('users').doc(currentUser.uid).get();
                if (userDoc.exists) {
                    const udata = userDoc.data();
                    if (udata.avatar) {
                        avatarToSend = udata.avatar;
                        currentUser.avatar = udata.avatar;
                        setStoredUser(currentUser);
                    }
                    if (udata.username) usernameToSend = udata.username;
                }
            } catch (e) {
                console.warn('[sendMessage] Fallback ke avatar lokal:', e);
            }
        }

        const payload = {
            uid: currentUser.uid,
            username: usernameToSend,
            avatar: avatarToSend,
            text: text || ''
        };
        if (replyTo) payload.replyTo = replyTo;
        if (media) {
            payload.mediaUrl = media.mediaUrl;
            payload.mediaType = media.mediaType;
            payload.fileName = media.fileName;
            payload.fileSize = media.fileSize;
            if (media.duration) payload.duration = media.duration;
        }

        try {
            const res = await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            return res.ok;
        } catch (e) {
            console.error('[sendMessage] Fetch error:', e);
            return false;
        }
    }

    /* ============================================================
       LINK PREVIEW (sanitized)
    ============================================================ */
    async function fetchLinkPreview(url) {
        if (!isValidHttpUrl(url)) return null;
        const cached = linkPreviewCache.get(url);
        if (cached && (Date.now() - cached.ts) < LINK_PREVIEW_CACHE_TTL) {
            return cached.data;
        }
        try {
            const res = await fetch('/api/link-preview?url=' + encodeURIComponent(url), {
                method: 'GET'
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (!data || !data.title) return null;
            const safe = {
                title: String(data.title || '').slice(0, 200),
                description: String(data.description || '').slice(0, 300),
                image: safeImageUrl(data.image),
                domain: (() => {
                    try { return new URL(url).hostname; } catch(e) { return ''; }
                })()
            };
            linkPreviewCache.set(url, { ts: Date.now(), data: safe });
            return safe;
        } catch (e) {
            return null;
        }
    }

    function extractFirstUrl(text) {
        if (!text) return null;
        const matches = text.match(urlRegex);
        if (!matches || matches.length === 0) return null;
        const url = matches[0];
        return isValidHttpUrl(url) ? url : null;
    }

    function buildLinkPreviewElement(preview, url) {
        const a = document.createElement('a');
        a.className = 'link-preview';
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.addEventListener('click', function(e) { e.stopPropagation(); });

        if (preview.image) {
            const img = document.createElement('img');
            img.className = 'link-preview-image';
            img.src = preview.image;
            img.alt = preview.title || '';
            img.loading = 'lazy';
            img.onerror = function() { this.remove(); };
            a.appendChild(img);
        }

        const info = document.createElement('div');
        info.className = 'link-preview-info';

        const domainEl = document.createElement('div');
        domainEl.className = 'link-preview-domain';
        domainEl.innerHTML = '<i class="fa-solid fa-link"></i> ';
        domainEl.appendChild(document.createTextNode(preview.domain || ''));
        info.appendChild(domainEl);

        if (preview.title) {
            const titleEl = document.createElement('div');
            titleEl.className = 'link-preview-title';
            titleEl.textContent = preview.title;
            info.appendChild(titleEl);
        }
        if (preview.description) {
            const descEl = document.createElement('div');
            descEl.className = 'link-preview-desc';
            descEl.textContent = preview.description;
            info.appendChild(descEl);
        }

        a.appendChild(info);
        return a;
    }

    /* ============================================================
       TYPING INDICATOR
    ============================================================ */
    async function broadcastTyping() {
        if (!currentUser) return;
        const db = getDb();
        if (!db) return;
        try {
            await db.collection('typing').doc(currentUser.uid).set({
                uid: currentUser.uid,
                username: currentUser.username,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) { /* silent */ }
    }

    async function clearTyping() {
        if (!currentUser) return;
        const db = getDb();
        if (!db) return;
        try {
            await db.collection('typing').doc(currentUser.uid).delete();
        } catch (e) { /* silent */ }
    }

    function onInputTyping() {
    const input = document.getElementById('chat-input');
    const hasText = input && input.value.trim().length > 0;
    const isFocused = document.activeElement === input;
    const isOnGroupPage = (typeof window.currentPage !== 'undefined' && window.currentPage === 'group');

    // Kalau gak ada text, atau gak fokus, atau bukan di grup → clear typing
    if (!hasText || !isFocused || !isOnGroupPage) {
        clearTimeout(typingDebounceTimer);
        clearTimeout(typingCleanupTimer);
        clearTyping();
        return;
    }

    clearTimeout(typingDebounceTimer);
    typingDebounceTimer = setTimeout(() => {
        broadcastTyping();
    }, 400);

    clearTimeout(typingCleanupTimer);
    typingCleanupTimer = setTimeout(() => {
        clearTyping();
    }, TYPING_CLEANUP);
}

    let typingUnsubscribe = null;
    function subscribeTyping() {
        const db = getDb();
        if (!db) return;
        if (typingUnsubscribe) try { typingUnsubscribe(); } catch(e) {}

        typingUnsubscribe = db.collection('typing').onSnapshot(snap => {
            const now = Date.now();
            const names = [];
            snap.forEach(doc => {
                const d = doc.data();
                if (d.uid === currentUser?.uid) return;
                const ts = d.updatedAt?.toMillis?.() || now;
                if (now - ts > TYPING_CLEANUP + 2000) return;
                names.push(d.username || 'Seseorang');
            });
            renderTypingIndicator(names);
        }, err => {
            console.warn('[Typing] Listener error:', err);
        });
    }

    function renderTypingIndicator(names) {
        const el = document.getElementById('typing-indicator');
        const txt = document.getElementById('typing-text');
        if (!el || !txt) return;
        if (names.length === 0) {
            el.classList.remove('visible');
            return;
        }
        let label = '';
        if (names.length === 1) label = names[0] + ' sedang mengetik...';
        else if (names.length === 2) label = names[0] + ' dan ' + names[1] + ' sedang mengetik...';
        else label = names[0] + ' dan ' + (names.length - 1) + ' lainnya sedang mengetik...';
        txt.textContent = label;
        el.classList.add('visible');
    }

    /* ============================================================
       INCREMENTAL RENDERING
    ============================================================ */
    function isNearBottom() {
        const list = document.getElementById('messages-list');
        if (!list) return true;
        const threshold = 120;
        return (list.scrollHeight - list.scrollTop - list.clientHeight) < threshold;
    }

    function scrollToBottom(smooth) {
        const list = document.getElementById('messages-list');
        if (!list) return;
        if (smooth) {
            list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
        } else {
            list.scrollTop = list.scrollHeight;
        }
    }

    function updateScrollButton() {
        const btn = document.getElementById('scroll-bottom-btn');
        const pill = document.getElementById('scroll-unread-pill');
        if (!btn) return;
        if (!isUserNearBottom) {
            btn.classList.add('visible');
            if (unreadCount > 0 && pill) {
                pill.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
                pill.style.display = 'flex';
            } else if (pill) {
                pill.style.display = 'none';
            }
        } else {
            btn.classList.remove('visible');
            if (pill) pill.style.display = 'none';
            unreadCount = 0;
            updateBottomNavBadge();
        }
    }

    function updateBottomNavBadge() {
    const badge = document.getElementById('bottom-nav-group-badge');
    if (!badge) return;

    // Hanya tampil kalau user udah punya profil
    if (!currentUser) {
        badge.classList.remove('show');
        return;
    }

    if (unreadCount > 0 && currentPage !== 'group') {
        badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        badge.classList.add('show');
    } else {
        badge.classList.remove('show');
    }
}

/* ============================================================
   UNREAD COUNT — badge notif di menu Grup
============================================================ */
let lastChatReadAt = 0;
let unreadListenerUnsub = null;

async function markChatAsRead() {
    if (!currentUser) return;
    const db = getDb();
    if (!db) return;
    try {
        lastChatReadAt = Date.now();
        await db.collection('users').doc(currentUser.uid).update({
            lastChatReadAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update badge
        const badge = document.getElementById('bottom-nav-group-badge');
        if (badge) badge.classList.remove('show');
        unreadCount = 0;
    } catch (e) {
        // silent — user doc mungkin belum ada
    }
}

async function initUnreadListener() {
    if (!currentUser) return;
    const db = getDb();
    if (!db) return;

    // Ambil lastChatReadAt
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            const d = userDoc.data();
            lastChatReadAt = d.lastChatReadAt?.toMillis?.() || 0;
        }
    } catch (e) {}

    if (unreadListenerUnsub) {
        try { unreadListenerUnsub(); } catch(e) {}
        unreadListenerUnsub = null;
    }

    unreadListenerUnsub = db.collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(50)
        .onSnapshot(snap => {
            if (!currentUser) return;
            const myUid = currentUser.uid;
            let count = 0;
            snap.forEach(doc => {
                const d = doc.data();
                const senderId = d.senderId || d.uid || d.sender || '';
                if (senderId === myUid) return;
                if (d.type === 'join' || d.type === 'leave') return;
                if (d.isDeletedForAll) return;
                const ts = d.timestamp?.toMillis?.() || 0;
                if (ts > lastChatReadAt) count++;
            });

            // Update badge global (dipakai saat di luar halaman grup)
            if (currentPage !== 'group') {
                const badge = document.getElementById('bottom-nav-group-badge');
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count > 99 ? '99+' : String(count);
                        badge.classList.add('show');
                    } else {
                        badge.classList.remove('show');
                    }
                }
            }
        }, err => {
            console.warn('[Unread] Listener error:', err);
        });
}
    /* ============================================================
       BUILD MESSAGE ELEMENT (XSS-safe)
    ============================================================ */
    function buildAvatar(uid, avatarUrl, username) {
        const wrap = document.createElement('div');
        wrap.style.width = '32px';
        wrap.style.height = '32px';
        wrap.style.minWidth = '32px';
        wrap.style.maxWidth = '32px';
        wrap.style.borderRadius = '50%';
        wrap.style.background = '#2a2a35';
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.justifyContent = 'center';
        wrap.style.fontSize = '14px';
        wrap.style.fontWeight = 'bold';
        wrap.style.color = '#fff';
        wrap.style.overflow = 'hidden';
        wrap.style.flexShrink = '0';
        wrap.style.lineHeight = '1';
        wrap.style.boxSizing = 'border-box';

        let finalUrl = safeImageUrl(avatarUrl);
        let finalName = username || 'unknown';

        if (window._userAvatarCache[uid]) {
            const c = window._userAvatarCache[uid];
            if (c.avatar && safeImageUrl(c.avatar)) finalUrl = safeImageUrl(c.avatar);
            if (c.username) finalName = c.username;
        }

        if (finalUrl) {
            const bust = Date.now();
            const cleanUrl = finalUrl.split('?')[0];
            const img = document.createElement('img');
            img.src = cleanUrl + '?v=' + bust;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.display = 'block';
            img.style.borderRadius = '50%';
            img.onerror = function() {
                wrap.innerHTML = '';
                wrap.textContent = (finalName || '?')[0].toUpperCase();
            };
            wrap.appendChild(img);
        } else {
            wrap.textContent = (finalName || '?')[0].toUpperCase();
        }
        return wrap;
    }
/* ============================================================
   REACTION
============================================================ */
const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function renderReactionsIntoBubble(bubble, data, docId, isMine) {
    const reactions = data.reactions || {};
    const grouped = {};
    const myUid = getMyUid();

    Object.keys(reactions).forEach(uid => {
        const em = reactions[uid];
        if (!em) return;
        if (!grouped[em]) grouped[em] = { count: 0, mine: false };
        grouped[em].count++;
        if (uid === myUid) grouped[em].mine = true;
    });

    const emojis = Object.keys(grouped);
    if (emojis.length === 0) return;

    const row = document.createElement('div');
    row.className = 'reactions-row' + (isMine ? ' align-mine' : '');

    emojis.forEach(em => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'reaction-chip' + (grouped[em].mine ? ' mine' : '');
        chip.innerHTML = '<span>' + em + '</span><span class="count">' + grouped[em].count + '</span>';
        chip.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleReaction(docId, em);
        });
        row.appendChild(chip);
    });

    bubble.appendChild(row);
}

async function toggleReaction(docId, emoji) {
    if (!currentUser) {
        showToast('Buat profil dulu', 'warning');
        return;
    }
    const db = getDb();
    if (!db) return;

    try {
        const docRef = db.collection('messages').doc(docId);
        const doc = await docRef.get();
        if (!doc.exists) return;

        const data = doc.data();
        const reactions = data.reactions || {};
        const myUid = currentUser.uid;

        if (reactions[myUid] === emoji) {
            delete reactions[myUid];   // toggle off
        } else {
            reactions[myUid] = emoji;  // set / ganti
        }

        await docRef.update({ reactions });
    } catch (err) {
        console.error('[Reaction] Error:', err);
        showToast('Gagal react', 'error');
    }
}

function showReactionBar(anchorEl, docId) {
    // Hapus reaction bar lama kalau ada
    document.querySelectorAll('.reaction-bar').forEach(b => b.remove());

    const bar = document.createElement('div');
    bar.className = 'reaction-bar';

    REACTION_EMOJIS.forEach(em => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = em;
        b.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleReaction(docId, em);
            bar.remove();
        });
        bar.appendChild(b);
    });

    document.body.appendChild(bar);

    // Posisi: di atas bubble
    const rect = anchorEl.getBoundingClientRect();
    const barWidth = bar.offsetWidth || 240;
    let left = rect.left + rect.width / 2 - barWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - barWidth - 8));
    const top = Math.max(8, rect.top - 50);

    bar.style.left = left + 'px';
    bar.style.top = top + 'px';

    // Auto close kalau klik di luar
    setTimeout(() => {
        document.addEventListener('click', function closeBar(e) {
            if (!bar.contains(e.target)) {
                bar.remove();
                document.removeEventListener('click', closeBar);
            }
        });
    }, 50);
}
    function getDeletedMessageHTML(type) {
    const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>';
    let label;
    if (type === 'admin') {
        label = 'Pesan ini dihapus oleh admin';
    } else if (type === 'for-me-mine' || type === 'for-all-mine') {
        label = 'Anda menghapus pesan ini';
    } else {
        label = 'Pesan ini telah dihapus';
    }
    return '<span class="deleted-msg-text">' + svg + '<span>' + label + '</span></span>';
}

    function buildAudioPlayer(data) {
        const player = document.createElement('div');
        player.className = 'audio-player';

        const audio = document.createElement('audio');
        audio.src = data.mediaUrl;
        audio.preload = 'metadata';
        audio.style.display = 'none';
        player.appendChild(audio);

        const playBtn = document.createElement('button');
        playBtn.className = 'audio-play-btn';
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        playBtn.type = 'button';
        player.appendChild(playBtn);

        const waveform = document.createElement('div');
        waveform.className = 'audio-waveform';
        const barCount = 30;
        const bars = [];
        for (let i = 0; i < barCount; i++) {
            const bar = document.createElement('span');
            bar.className = 'wave-bar';
            const h = 6 + Math.floor(Math.random() * 14);
            bar.style.height = h + 'px';
            waveform.appendChild(bar);
            bars.push(bar);
        }
        player.appendChild(waveform);

        const durEl = document.createElement('span');
        durEl.className = 'audio-duration';
        durEl.textContent = data.duration > 0 ? formatDurationMs(data.duration) : '0:00';
        player.appendChild(durEl);

        audio.addEventListener('loadedmetadata', function() {
            if (!data.duration) durEl.textContent = formatDurationMs(audio.duration * 1000);
        });
        audio.addEventListener('timeupdate', function() {
            if (audio.duration) {
                const progress = audio.currentTime / audio.duration;
                durEl.textContent = formatDurationMs(audio.currentTime * 1000);
                const playedCount = Math.floor(progress * bars.length);
                bars.forEach((b, i) => b.classList.toggle('played', i < playedCount));
            }
        });
        audio.addEventListener('ended', function() {
            playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            bars.forEach(b => b.classList.remove('played'));
            if (audio.duration) durEl.textContent = formatDurationMs(audio.duration * 1000);
        });

        playBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            if (audio.paused) {
                document.querySelectorAll('audio').forEach(a => {
                    if (a !== audio) { try { a.pause(); } catch(e) {} }
                });
                audio.play().catch(() => {
                    // Autoplay mungkin diblok — user sudah klik, harusnya OK
                    showToast('Tidak bisa memutar audio', 'warning');
                });
                playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
            } else {
                audio.pause();
                playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
            }
        });

        waveform.addEventListener('click', function(e) {
            if (!audio.duration) return;
            const rect = waveform.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, x / rect.width));
            audio.currentTime = pct * audio.duration;
        });

        return player;
    }

function buildMessageElement(doc) {
    const data = doc.data();
    const docId = doc.id;

    const senderId = data.senderId || data.uid || data.sender || '';
    const isMine = senderId === getMyUid();
    const isSystem = data.type === 'join' || data.type === 'leave' || senderId === 'system';

    const isDeletedForMe = Array.isArray(data.deletedFor) && data.deletedFor.includes(getMyUid());
const isDeletedForAll = data.isDeletedForAll === true;
const isDeletedByAdmin = data.isDeletedByAdmin === true;

let displayText = data.text || '';
let isDeletedMessage = false;
let deletedMessageType = null;

if (isDeletedByAdmin) {
    deletedMessageType = 'admin';
    displayText = '';
    isDeletedMessage = true;
} else if (isDeletedForAll) {
    deletedMessageType = isMine ? 'for-all-mine' : 'for-all-other';
    displayText = '';
    isDeletedMessage = true;
} else if (isDeletedForMe) {
    deletedMessageType = isMine ? 'for-me-mine' : 'for-me-other';
    displayText = '';
    isDeletedMessage = true;
}

    const div = document.createElement('div');
div.className = 'message-item';
if (isMine && !isSystem) div.classList.add('bubble-mine');
div.dataset.docId = docId;
div.dataset.username = data.username || 'unknown';
div.dataset.text = data.text || '';
div.dataset.isSystem = String(isSystem);   // ⬅️ TAMBAH INI
    div.style.display = 'flex';
    div.style.marginBottom = '4px';
    div.style.gap = '6px';
    div.style.alignItems = 'flex-start';
    div.style.transition = 'transform 0.2s';
    div.style.touchAction = 'pan-y';
    div.style.position = 'relative';

    const avatarDiv = buildAvatar(senderId, data.avatar, data.username);

    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.style.flex = '1';
    bubbleWrapper.style.maxWidth = '75%';
    bubbleWrapper.style.display = 'flex';
    bubbleWrapper.style.flexDirection = 'column';

    const bubble = document.createElement('div');
    bubble.style.padding = '6px 12px';
    bubble.style.borderRadius = '12px';
    bubble.style.wordBreak = 'break-word';
    bubble.style.lineHeight = '1.4';
    bubble.style.fontSize = '13px';
    bubble.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
    bubble.style.position = 'relative';

    // ✅ URUTAN BENAR: isSystem cek duluan
    if (isSystem) {
        bubble.style.background = 'transparent';
        bubble.style.color = 'var(--text-muted)';
        bubble.style.textAlign = 'center';
        bubble.style.fontSize = '11px';
        bubble.style.padding = '2px 0';
        bubble.style.boxShadow = 'none';
        bubbleWrapper.style.alignItems = 'center';
        bubbleWrapper.style.maxWidth = '100%';
    } else if (isMine) {
        bubble.style.background = 'var(--accent)';
        bubble.style.color = '#fff';
        bubble.style.borderTopRightRadius = '4px';
        bubbleWrapper.style.alignItems = 'flex-end';
    } else {
        bubble.style.background = 'var(--bg-input)';
        bubble.style.color = 'var(--text)';
        bubble.style.borderTopLeftRadius = '4px';
    }

    if (!isSystem && !isMine) {
        const nameSpan = document.createElement('div');
        nameSpan.style.fontSize = '10px';
        nameSpan.style.fontWeight = '600';
        nameSpan.style.color = 'var(--accent)';
        nameSpan.style.marginBottom = '1px';
        nameSpan.textContent = data.username || 'unknown';
        bubble.appendChild(nameSpan);
    }

    if (data.mediaUrl && (!displayText || !displayText.trim()) && !isDeletedMessage) {
        bubble.classList.add('bubble-media-only');
    }

    // ---- Media ----
    if (data.mediaUrl && !isDeletedMessage) {
        const mediaUrlSafe = safeImageUrl(data.mediaUrl);
        if (mediaUrlSafe) {
            const mediaContainer = document.createElement('div');
            mediaContainer.style.margin = '4px 0';
            mediaContainer.style.maxWidth = '220px';

            if (data.mediaType === 'image' || data.mediaType === 'video') {
                const mediaBox = document.createElement('div');
                mediaBox.className = 'msg-media';

                if (data.mediaType === 'image') {
                    const img = document.createElement('img');
                    img.src = mediaUrlSafe;
                    img.alt = data.fileName || 'Gambar';
                    img.loading = 'lazy';
                    mediaBox.appendChild(img);
                } else {
                    const video = document.createElement('video');
                    video.src = mediaUrlSafe;
                    video.preload = 'metadata';
                    video.playsInline = true;
                    video.muted = true;
                    mediaBox.appendChild(video);

                    const playOverlay = document.createElement('div');
                    playOverlay.className = 'play-overlay';
                    playOverlay.innerHTML = '<i class="fa-solid fa-play"></i>';
                    mediaBox.appendChild(playOverlay);
                }

                const zoomHint = document.createElement('div');
                zoomHint.className = 'media-zoom-hint';
                zoomHint.innerHTML = '<i class="fa-solid fa-expand"></i>';
                mediaBox.appendChild(zoomHint);

                mediaBox.addEventListener('click', function(e) {
                    e.stopPropagation();
                    openLightbox(mediaUrlSafe, data.mediaType, data.fileName);
                });

                mediaContainer.appendChild(mediaBox);

            } else if (data.mediaType === 'audio') {
                mediaContainer.appendChild(buildAudioPlayer(data));
            } else {
                const link = document.createElement('a');
                link.href = mediaUrlSafe;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.style.color = 'inherit';
                link.style.textDecoration = 'none';
                link.style.padding = '8px 10px';
                link.style.background = 'rgba(0,0,0,0.15)';
                link.style.borderRadius = '8px';
                link.style.display = 'flex';
                link.style.alignItems = 'center';
                link.style.gap = '8px';
                link.style.fontSize = '12px';
                link.innerHTML = '<i class="fa-solid fa-file-lines" style="font-size:20px;"></i>';
                const nameSpan = document.createElement('span');
                nameSpan.style.flex = '1';
                nameSpan.style.wordBreak = 'break-all';
                nameSpan.textContent = data.fileName || 'File';
                link.appendChild(nameSpan);
                mediaContainer.appendChild(link);
            }

            bubble.appendChild(mediaContainer);
        }
    }

    // ---- Text ----
    const textSpan = document.createElement('div');
    textSpan.className = 'text-content';

    let finalText = displayText;

    if (isSystem && data.type === 'join') {
        if (senderId === getMyUid()) {
            finalText = 'Anda bergabung ke grup ini';
        } else {
            finalText = (data.username || 'Seseorang') + ' bergabung ke grup ini';
        }
    }

    if (isDeletedMessage) {
        textSpan.innerHTML = getDeletedMessageHTML(deletedMessageType);
    } else if (finalText) {
        const firstUrl = extractFirstUrl(finalText);
        textSpan.textContent = finalText;

        if (firstUrl) {
            fetchLinkPreview(firstUrl).then(preview => {
                if (!preview) return;
                if (!document.body.contains(textSpan)) return;
                if (textSpan.nextElementSibling && textSpan.nextElementSibling.classList.contains('link-preview')) return;
                const previewEl = buildLinkPreviewElement(preview, firstUrl);
                textSpan.parentNode.insertBefore(previewEl, textSpan.nextSibling);
            }).catch(() => {});
        }
    }

    if (data.isEdited && !isDeletedMessage && finalText) {
        const editedLabel = document.createElement('span');
        editedLabel.style.fontSize = '9px';
        editedLabel.style.opacity = '0.5';
        editedLabel.style.marginLeft = '4px';
        editedLabel.textContent = ' (diedit)';
        textSpan.appendChild(editedLabel);
    }

    if (finalText || isDeletedMessage) {
        bubble.appendChild(textSpan);
    }

    // ---- Reply ----
    if (data.replyTo && !isDeletedMessage) {
        const replyContainer = document.createElement('div');
        replyContainer.style.padding = '2px 8px';
        replyContainer.style.marginBottom = '3px';
        replyContainer.style.borderRadius = '4px';
        replyContainer.style.fontSize = '10px';
        replyContainer.style.opacity = '0.7';
        replyContainer.style.borderLeft = '2px solid var(--accent)';
        if (isMine) {
            replyContainer.style.background = 'rgba(255,255,255,0.08)';
        } else {
            replyContainer.style.background = 'var(--bg-hover)';
        }
        const replyName = document.createElement('span');
        replyName.style.fontWeight = '600';
        replyName.textContent = data.replyTo.username || 'unknown';
        replyContainer.appendChild(replyName);

        const replyText = document.createElement('span');
        replyText.textContent = ': ' + (data.replyTo.text || '');
        replyContainer.appendChild(replyText);

        bubble.prepend(replyContainer);
    }
// ---- Reactions ----
renderReactionsIntoBubble(bubble, data, docId, isMine);

    // ---- Timestamp ----
    if (data.timestamp || isMine) {
        const timeSpan = document.createElement('div');
        timeSpan.className = 'bubble-timestamp';

        if (data.timestamp) {
            timeSpan.appendChild(document.createTextNode(formatTime(data.timestamp)));
        }

        if (isMine && !isSystem && !isDeletedForAll) {
            const readStatus = document.createElement('span');
            readStatus.className = 'read-check';
            const readCount = data.readBy ? Object.keys(data.readBy).length : 0;
            if (readCount > 0) {
                readStatus.innerHTML = '✓✓';
                readStatus.style.color = 'var(--success)';
                readStatus.classList.add('read-double');
            } else {
                readStatus.innerHTML = '✓';
                readStatus.style.color = 'var(--text-muted)';
            }
            timeSpan.appendChild(readStatus);
        }
        bubble.appendChild(timeSpan);
    }

    // ---- Layout ----
    if (isSystem) {
        div.style.justifyContent = 'center';
        div.appendChild(bubble);
    } else if (isMine) {
        div.style.justifyContent = 'flex-end';
        bubbleWrapper.appendChild(bubble);
        div.appendChild(bubbleWrapper);
    } else {
        div.appendChild(avatarDiv);
        bubbleWrapper.appendChild(bubble);
        div.appendChild(bubbleWrapper);
    }

    // ---- Context menu + double-tap reaction ----
    if (!isSystem && !isDeletedForAll) {
        let longPressTimer = null;
        let lastTap = 0;

        const showMenu = (e) => {
            e.preventDefault();
            const now = Date.now();
            const msgTime = data.timestamp ? data.timestamp.toMillis() : 0;
            const canEdit = (now - msgTime) < 60 * 60 * 1000;
            showMessageMenu(docId, senderId, data.username, data.text, isMine, canEdit, data.isEdited);
        };

        // Long press → menu
        div.addEventListener('touchstart', function() {
            longPressTimer = setTimeout(() => showMenu({ preventDefault: () => {} }), 600);
        }, { passive: true });
        div.addEventListener('touchmove', function() { clearTimeout(longPressTimer); }, { passive: true });
        div.addEventListener('touchend', function() { clearTimeout(longPressTimer); });
        div.addEventListener('contextmenu', showMenu);

        // Double tap → reaction bar (mobile)
        div.addEventListener('touchend', function(e) {
            const now = Date.now();
            if (now - lastTap < 300) {
                if (longPressTimer) clearTimeout(longPressTimer);
                showReactionBar(div, docId);
                lastTap = 0;
            } else {
                lastTap = now;
            }
        });

        // Double click → reaction bar (desktop)
        div.addEventListener('dblclick', function(e) {
            e.preventDefault();
            showReactionBar(div, docId);
        });
    }

    return div;
}

/* ============================================================
   MESSAGE LIST UPDATE (incremental via docChanges)
   — function di bawah ini JANGAN diubah, ini placeholder
============================================================ */
function handleSnapshotChanges(snapshot, opts) {
    const list = document.getElementById('messages-list');
    if (!list) return;
        const wasNearBottom = isNearBottom();

        let addedCount = 0;
        let addedNotMine = 0;

        snapshot.docChanges().forEach(change => {
            const doc = change.doc;
            const docId = doc.id;

            if (change.type === 'added') {
    if (renderedMessages.has(docId)) return;

    const data = doc.data();
    const msgTs = data.timestamp?.toMillis?.() || 0;

    // ✅ Guard: skip kalau lebih tua dari cursor
    if (opts?.skipOlderThan && msgTs && msgTs < opts.skipOlderThan) {
        console.log('[Chat] Skip pesan lama:', docId, '(ts=' + msgTs + ', cursor=' + opts.skipOlderThan + ')');
        return;
    }
                // Insert berurutan berdasarkan timestamp
                const el = buildMessageElement(doc);

                // Cari posisi insert yang tepat
                const existingTimestamps = Array.from(renderedMessages.entries()).map(([id, el]) => {
                    const ts = el.dataset.ts ? parseInt(el.dataset.ts) : 0;
                    return { id, el, ts };
                });
                el.dataset.ts = String(msgTs || Date.now());

                let inserted = false;
                if (existingTimestamps.length > 0) {
                    // Cari elemen berikutnya yang lebih baru
                    let nextEl = null;
                    for (let i = 0; i < existingTimestamps.length; i++) {
                        const item = existingTimestamps[i];
                        if (item.ts > msgTs) {
                            nextEl = item.el;
                            break;
                        }
                    }
                    if (nextEl) {
                        list.insertBefore(el, nextEl);
                        inserted = true;
                    }
                }
if (!inserted) {
    list.appendChild(el);
}

renderedMessages.set(docId, el);
addedCount++;
// ✅ FIX: Hapus pending message yang match dengan pesan asli ini
const senderIdCheck = data.senderId || data.uid || data.sender || '';
if (senderIdCheck === getMyUid()) {
    const msgText = (data.text || '').trim();
    const msgFileName = data.fileName || '';
    
    for (let i = pendingMessages.length - 1; i >= 0; i--) {
        const p = pendingMessages[i];
        let match = false;
        
        // Text message
        if (p.type === 'text' && msgText && p.text === msgText) {
            match = true;
        }
        // Media message (image, video, audio, file, document)
        else if (msgFileName && p.fileName === msgFileName) {
            match = true;
        }
        
        if (match) {
            console.log('[Chat] Auto-remove pending:', p.id);
            const el = document.querySelector('[data-pending-id="' + p.id + '"]');
            if (el) el.remove();
            try { URL.revokeObjectURL(p.previewUrl); } catch(e) {}
            pendingMessages.splice(i, 1);
        }
    }
}
                const senderId = data.senderId || data.uid || data.sender || '';
                if (senderId !== getMyUid()) addedNotMine++;
            } else if (change.type === 'modified') {
                const oldEl = renderedMessages.get(docId);
                if (oldEl) {
                    const newEl = buildMessageElement(doc);
                    newEl.dataset.ts = oldEl.dataset.ts || String(Date.now());
                    oldEl.replaceWith(newEl);
                    renderedMessages.set(docId, newEl);
                }
            } else if (change.type === 'removed') {
                const oldEl = renderedMessages.get(docId);
                if (oldEl) {
                    oldEl.remove();
                    renderedMessages.delete(docId);
                }
            }
        });

        // Update unread kalau user tidak di bottom
        if (!wasNearBottom && addedNotMine > 0 && currentPage === 'group') {
            unreadCount += addedNotMine;
        }

        isUserNearBottom = wasNearBottom;

        // Auto-scroll hanya kalau user sebelumnya di bottom
        if (wasNearBottom && addedCount > 0) {
            requestAnimationFrame(() => scrollToBottom(false));
        }

        updateScrollButton();
    updateBottomNavBadge();
    rebuildDateSeparators(list);   // ⬅️ TAMBAH INI
    observeMessages();
}

    /* ============================================================
       RENDER PENDING
    ============================================================ */
    function renderPendingMessage(p) {
        const div = document.createElement('div');
        div.className = 'message-item pending bubble-mine';
        div.dataset.pendingId = p.id;
        div.style.display = 'flex';
        div.style.marginBottom = '4px';
        div.style.justifyContent = 'flex-end';
        div.style.gap = '6px';

        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.style.maxWidth = '75%';
        bubbleWrapper.style.display = 'flex';
        bubbleWrapper.style.flexDirection = 'column';
        bubbleWrapper.style.alignItems = 'flex-end';

        const bubble = document.createElement('div');
        bubble.style.borderRadius = '12px';
        bubble.style.background = 'var(--accent)';
        bubble.style.color = '#fff';
        bubble.style.borderTopRightRadius = '4px';
        bubble.style.position = 'relative';
        bubble.style.overflow = 'hidden';

        if (p.type === 'text') {
            bubble.style.padding = '6px 12px';
            bubble.style.wordBreak = 'break-word';
            bubble.style.lineHeight = '1.4';
            bubble.style.fontSize = '13px';
            bubble.style.minWidth = '70px';

            if (p.replyTo) {
                const replyBox = document.createElement('div');
                replyBox.style.padding = '3px 8px';
                replyBox.style.marginBottom = '4px';
                replyBox.style.borderRadius = '4px';
                replyBox.style.fontSize = '10px';
                replyBox.style.background = 'rgba(255,255,255,0.14)';
                replyBox.style.borderLeft = '2px solid rgba(255,255,255,0.5)';
                replyBox.style.lineHeight = '1.3';
                const replyName = document.createElement('span');
                replyName.style.fontWeight = '600';
                replyName.textContent = (p.replyTo.username || 'unknown') + ': ';
                replyBox.appendChild(replyName);
                const replyText = document.createElement('span');
                replyText.style.opacity = '0.85';
                replyText.textContent = p.replyTo.text || '';
                replyBox.appendChild(replyText);
                bubble.appendChild(replyBox);
            }

            const txt = document.createElement('div');
            txt.textContent = p.text || '';
            txt.style.whiteSpace = 'pre-wrap';
            txt.style.wordBreak = 'break-word';
            bubble.appendChild(txt);

            const metaRow = document.createElement('div');
            metaRow.style.display = 'flex';
            metaRow.style.justifyContent = 'flex-end';
            metaRow.style.alignItems = 'center';
            metaRow.style.gap = '4px';
            metaRow.style.marginTop = '3px';
            metaRow.style.fontSize = '9px';
            metaRow.style.opacity = '0.75';
            const clock = document.createElement('i');
            clock.className = 'fa-regular fa-clock';
            metaRow.appendChild(clock);
            bubble.appendChild(metaRow);

            bubbleWrapper.appendChild(bubble);
            div.appendChild(bubbleWrapper);
            return div;
        }

        if (p.type === 'image' || p.type === 'video') {
            bubble.style.padding = '3px';
            const box = document.createElement('div');
            box.className = 'pending-media-box';

            if (p.type === 'image') {
                const img = document.createElement('img');
                img.src = p.previewUrl;
                img.alt = 'uploading';
                box.appendChild(img);
            } else {
                const video = document.createElement('video');
                video.src = p.previewUrl;
                video.muted = true;
                video.playsInline = true;
                video.preload = 'metadata';
                box.appendChild(video);
            }

            const overlay = document.createElement('div');
            overlay.className = 'pending-overlay';
            const spinner = document.createElement('div');
            spinner.className = 'pending-spinner';
            overlay.appendChild(spinner);
            box.appendChild(overlay);

            const clock = document.createElement('div');
            clock.className = 'pending-clock';
            clock.innerHTML = '<i class="fa-regular fa-clock"></i>';
            box.appendChild(clock);
            bubble.appendChild(box);

            if (p.text) {
                const txt = document.createElement('div');
                txt.style.padding = '6px 10px';
                txt.style.fontSize = '13px';
                txt.textContent = p.text;
                bubble.appendChild(txt);
            }
        } else if (p.type === 'audio') {
            bubble.style.padding = '0';
            const inner = document.createElement('div');
            inner.className = 'pending-simple';
            inner.innerHTML = '<i class="fa-solid fa-microphone"></i><span>Mengirim suara...</span><span style="margin-left:auto;opacity:0.7;"><i class="fa-regular fa-clock"></i></span>';
            bubble.appendChild(inner);
        } else {
            bubble.style.padding = '0';
            const inner = document.createElement('div');
            inner.className = 'pending-simple';
            inner.innerHTML = '<i class="fa-solid fa-file-lines"></i>';
            const nameSpan = document.createElement('span');
            nameSpan.style.flex = '1';
            nameSpan.style.wordBreak = 'break-all';
            nameSpan.textContent = p.fileName || 'Mengirim file...';
            inner.appendChild(nameSpan);
            const clockSpan = document.createElement('span');
            clockSpan.style.opacity = '0.7';
            clockSpan.innerHTML = '<i class="fa-regular fa-clock"></i>';
            inner.appendChild(clockSpan);
            bubble.appendChild(inner);
        }

        bubbleWrapper.appendChild(bubble);
        div.appendChild(bubbleWrapper);
        return div;
    }

    function renderPending() {
        const list = document.getElementById('messages-list');
        if (!list) return;

        // Hapus semua pending lama
        list.querySelectorAll('.message-item.pending').forEach(el => el.remove());

        // Render pending
        pendingMessages.forEach(p => {
            const el = renderPendingMessage(p);
            list.appendChild(el);
        });
    }

    function removePendingById(id) {
        const idx = pendingMessages.findIndex(p => p.id === id);
        if (idx === -1) return false;
        try { URL.revokeObjectURL(pendingMessages[idx].previewUrl); } catch(e) {}
        pendingMessages.splice(idx, 1);

        const list = document.getElementById('messages-list');
        if (list) {
            const el = list.querySelector('[data-pending-id="' + id + '"]');
            if (el) el.remove();
        }
        return true;
    }

    /* ============================================================
       SUBSCRIBE MESSAGES (pagination + realtime)
    ============================================================ */
function subscribeMessages() {
    const db = getDb();
    if (!db) {
        console.warn('[Chat] DB belum siap');
        return;
    }

    if (messagesUnsubscribe) {
        try { messagesUnsubscribe(); } catch(e) {}
        messagesUnsubscribe = null;
    }
    renderedMessages.clear();

    const list = document.getElementById('messages-list');
    if (list) list.innerHTML = '';

    // Initial load: 10 pesan terbaru
    db.collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(INITIAL_LOAD)
        .get()
        .then(snapshot => {
            const docs = snapshot.docs.reverse(); // asc order (terlama → terbaru)

            console.log('[Chat] Initial load:', docs.length, 'pesan (limit=' + INITIAL_LOAD + ')');

            if (docs.length > 0) {
                // ✅ FIX: fallback ke Date.now() kalau timestamp null/undefined
                const firstDocTs = docs[0].data().timestamp?.toMillis?.();
                oldestLoadedTs = firstDocTs || Date.now();

                console.log('[Chat] oldestLoadedTs diset:', oldestLoadedTs, '(dari', docs[0].id + ')');

                hasMoreOldMessages = docs.length === INITIAL_LOAD;
            } else {
                // ✅ FIX #4: pakai Date.now() bukan null
                // Grup kosong — pakai waktu sekarang sebagai cursor.
                // Listener nanti akan tangkap pesan baru yang masuk setelah ini.
                oldestLoadedTs = Date.now();
                hasMoreOldMessages = false;
                console.log('[Chat] Grup masih kosong, pakai waktu sekarang sebagai cursor');
            }

            // Render 10 pesan (batch pakai fragment biar gak kedip)
            // Render 10 pesan (batch pakai fragment biar gak kedip)
const listEl = document.getElementById('messages-list');
if (listEl) {
    const fragment = document.createDocumentFragment();
    docs.forEach(doc => {
        const d = doc.data();
        const ts = d.timestamp?.toMillis?.() || Date.now();
        const el = buildMessageElement(doc);
        el.dataset.ts = String(ts);
        fragment.appendChild(el);
        renderedMessages.set(doc.id, el);
    });
    listEl.innerHTML = '';
    listEl.appendChild(fragment);

    // ⬇️ Rebuild separator setelah render
    rebuildDateSeparators(listEl);
}
            initialLoadDone = true;
            observeMessages();
            requestAnimationFrame(() => scrollToBottom(false));

            // Realtime listener attach SETELAH initial render
                // Realtime listener attach SETELAH initial render
    startRealtimeListener();

    // Subscribe pin banner
    subscribePinnedMessage();
})
.catch(err => {
    console.error('[Chat] Initial load gagal:', err);
    hasMoreOldMessages = false;
    startRealtimeListener();
    subscribePinnedMessage();
});
}
/* ============================================================
   PIN PESAN — hanya Ekk Store
============================================================ */
function subscribePinnedMessage() {
    const db = getDb();
    if (!db) return;

    if (pinnedUnsubscribe) {
        try { pinnedUnsubscribe(); } catch(e) {}
        pinnedUnsubscribe = null;
    }

    pinnedUnsubscribe = db.collection('messages')
        .where('isPinned', '==', true)
        .limit(10)
        .onSnapshot(snap => {
            if (snap.empty) {
                currentPinnedMessage = null;
                hidePinBanner();
                return;
            }
            // Ambil yang paling baru di-pin
            const docs = snap.docs.map(d => ({ id: d.id, data: d.data() }));
            docs.sort((a, b) => {
                const ta = a.data.pinnedAt?.toMillis?.() || 0;
                const tb = b.data.pinnedAt?.toMillis?.() || 0;
                return tb - ta;
            });
            const doc = docs[0];
            const d = doc.data;
            currentPinnedMessage = {
                docId: doc.id,
                text: d.text || (d.mediaType ? '📎 ' + (d.fileName || 'File') : ''),
                username: d.username || 'unknown'
            };
            showPinBanner(currentPinnedMessage);
        }, err => {
            console.warn('[Pin] Listener error:', err);
        });
}

function showPinBanner(pin) {
    const banner = document.getElementById('pin-banner');
    const textEl = document.getElementById('pin-banner-text');
    const closeBtn = document.getElementById('pin-banner-close');
    if (!banner || !textEl) return;

    textEl.textContent = pin.username + ': ' + (pin.text || '(media)');
    banner.classList.add('visible');
    banner.dataset.pinDocId = pin.docId;

    const canUnpin = isOwnerUser(currentUser?.username);
    banner.classList.toggle('can-unpin', canUnpin);

    if (banner._clickHandler) {
        banner.removeEventListener('click', banner._clickHandler);
    }
    banner._clickHandler = function(e) {
        if (e.target.closest('#pin-banner-close')) return;
        scrollToPinnedMessage(pin.docId);
    };
    banner.addEventListener('click', banner._clickHandler);

    if (closeBtn) {
        if (closeBtn._unpinHandler) {
            closeBtn.removeEventListener('click', closeBtn._unpinHandler);
        }
        closeBtn._unpinHandler = function(e) {
            e.stopPropagation();
            unpinMessage(pin.docId);
        };
        closeBtn.addEventListener('click', closeBtn._unpinHandler);
    }
}

function hidePinBanner() {
    const banner = document.getElementById('pin-banner');
    if (banner) banner.classList.remove('visible');
}

function scrollToPinnedMessage(docId) {
    const el = renderedMessages.get(docId);
    if (!el) {
        showToast('Pesan tidak ditemukan di tampilan', 'info');
        return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('pin-flash');
    setTimeout(() => el.classList.remove('pin-flash'), 1300);
}

async function pinMessage(docId) {
    if (!isOwnerUser(currentUser?.username)) {
        showToast('Hanya Ekk Store yang bisa menyematkan pesan', 'warning');
        return;
    }
    const db = getDb();
    if (!db) return;

    try {
        // Unpin pesan lain dulu
        const existing = await db.collection('messages')
            .where('isPinned', '==', true)
            .get();

        const batch = db.batch();
        existing.forEach(doc => {
            if (doc.id !== docId) {
                batch.update(doc.ref, { isPinned: false, pinnedAt: null });
            }
        });

        batch.update(db.collection('messages').doc(docId), {
            isPinned: true,
            pinnedAt: firebase.firestore.FieldValue.serverTimestamp(),
            pinnedBy: currentUser.username
        });

        await batch.commit();
        showToast('Pesan disematkan', 'success');
    } catch (err) {
        console.error('[Pin] Error:', err);
        showToast('Gagal menyematkan: ' + err.message, 'error');
    }
}

async function unpinMessage(docId) {
    if (!isOwnerUser(currentUser?.username)) {
        showToast('Hanya Ekk Store yang bisa melepas sematan', 'warning');
        return;
    }
    const db = getDb();
    if (!db) return;
    try {
        await db.collection('messages').doc(docId).update({
            isPinned: false,
            pinnedAt: null
        });
        showToast('Sematan dilepas', 'success');
    } catch (err) {
        console.error('[Pin] Error:', err);
        showToast('Gagal melepas sematan', 'error');
    }
}

    function startRealtimeListener() {
    const db = getDb();
    if (!db) return;

    if (messagesUnsubscribe) {
        try { messagesUnsubscribe(); } catch(e) {}
        messagesUnsubscribe = null;
    }

    // ✅ FIX: kalau oldestLoadedTs gak ada, JANGAN attach
    //         (kalau attach tanpa startAt, Firestore kirim SEMUA pesan)
    if (!oldestLoadedTs) {
        console.warn('[Chat] oldestLoadedTs belum siap, retry 500ms...');
        setTimeout(startRealtimeListener, 500);
        return;
    }

    const cursor = new Date(oldestLoadedTs);
    console.log('[Chat] Realtime listener attach dari:', cursor.toISOString());

    let query = db.collection('messages')
        .orderBy('timestamp', 'asc')
        .startAt(cursor);

    messagesUnsubscribe = query.onSnapshot(snapshot => {
        // Safety: double-guard skipOlderThan
        handleSnapshotChanges(snapshot, { skipOlderThan: oldestLoadedTs });
    }, err => {
        console.error('[Chat] Realtime error:', err);
    });
}

    /* ============================================================
       LOAD OLDER MESSAGES
    ============================================================ */
    async function loadOlderMessages() {
        if (isLoadingOlder || !hasMoreOldMessages || !oldestLoadedTs) return;
        isLoadingOlder = true;

        const db = getDb();
        const list = document.getElementById('messages-list');
        if (!db || !list) {
            isLoadingOlder = false;
            return;
        }

        // Simpan posisi scroll
        const oldHeight = list.scrollHeight;
        const oldTop = list.scrollTop;

        // Loading indicator
        const loader = document.createElement('div');
        loader.id = 'older-loader';
        loader.style.cssText = 'text-align:center;padding:10px;color:var(--text-muted);font-size:11px;';
        loader.textContent = 'Memuat pesan lama...';
        list.insertBefore(loader, list.firstChild);

        try {
            const cursor = new Date(oldestLoadedTs);
            const snap = await db.collection('messages')
                .orderBy('timestamp', 'desc')
                .startAfter(cursor)
                .limit(50)
                .get();

            const docs = snap.docs.reverse();
            if (docs.length === 0) {
                hasMoreOldMessages = false;
            } else {
                // Prepend dalam urutan
                docs.forEach(doc => {
                    if (renderedMessages.has(doc.id)) return;
                    const el = buildMessageElement(doc);
                    el.dataset.ts = String(doc.data().timestamp?.toMillis?.() || Date.now());
                    list.insertBefore(el, loader.nextSibling);
                    renderedMessages.set(doc.id, el);
                });
                const firstDoc = docs[0];
                oldestLoadedTs = firstDoc.data().timestamp?.toMillis?.() || oldestLoadedTs;
                hasMoreOldMessages = docs.length === 50;
            }

       // Rebuild separator setelah prepend
rebuildDateSeparators(list);

// Restore scroll position
requestAnimationFrame(() => {
    const newHeight = list.scrollHeight;
    list.scrollTop = oldTop + (newHeight - oldHeight);
});

observeMessages();
        } catch (e) {
            console.warn('[Chat] Load older error:', e);
        } finally {
            if (loader.parentNode) loader.remove();
            isLoadingOlder = false;
        }
    }

    /* ============================================================
       OBSERVE (mark as read)
    ============================================================ */
    function observeMessages() {
        if (messagesObserver) {
            messagesObserver.disconnect();
        }
        messagesObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const el = entry.target;
                    const docId = el.dataset.docId;
                    if (docId) markMessageAsRead(docId);
                }
            });
        }, { threshold: 0.5 });

        document.querySelectorAll('.message-item[data-doc-id]').forEach(el => {
            messagesObserver.observe(el);
        });
    }

    async function markMessageAsRead(docId) {
        const uid = getMyUid();
        if (!uid) return;
        const db = getDb();
        if (!db) return;

        try {
            const doc = await db.collection('messages').doc(docId).get();
            if (!doc.exists) return;
            const data = doc.data();
            if (data.senderId === uid) return;
            if (data.isDeletedForAll) return;
            const readBy = data.readBy || {};
            if (readBy[uid]) return;
            readBy[uid] = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('messages').doc(docId).update({ readBy });
        } catch (error) { /* silent */ }
    }

    /* ============================================================
       MESSAGE CONTEXT MENU
    ============================================================ */
    function showMessageMenu(docId, senderId, username, text, isMine, canEdit, isEdited) {
        const oldMenu = document.getElementById('message-menu');
        if (oldMenu) oldMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'message-menu';
        menu.style.position = 'fixed';
        menu.style.bottom = '80px';
        menu.style.left = '50%';
        menu.style.transform = 'translateX(-50%)';
        menu.style.background = 'var(--bg-card)';
        menu.style.border = '1px solid var(--border)';
        menu.style.borderRadius = '12px';
        menu.style.padding = '8px';
        menu.style.boxShadow = '0 8px 30px rgba(0,0,0,0.6)';
        menu.style.zIndex = '99999';
        menu.style.minWidth = '200px';
        menu.style.display = 'flex';
        menu.style.flexDirection = 'column';
        menu.style.gap = '4px';

        function createMenuItem(label, icon, color) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.innerHTML = '<i class="' + icon + '"></i> ' + label;
            btn.style.padding = '10px 16px';
            btn.style.background = 'transparent';
            btn.style.border = 'none';
            btn.style.borderRadius = '8px';
            btn.style.color = color;
            btn.style.fontSize = '14px';
            btn.style.cursor = 'pointer';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.gap = '10px';
            btn.style.width = '100%';
            btn.style.textAlign = 'left';
            btn.addEventListener('mouseenter', function() { this.style.background = 'var(--bg-hover)'; });
            btn.addEventListener('mouseleave', function() { this.style.background = 'transparent'; });
            return btn;
        }

        if (isMine) {
            const infoBtn = createMenuItem('Info (baca)', 'fa-solid fa-circle-info', 'var(--text)');
            infoBtn.addEventListener('click', function() {
                menu.remove();
                showReadReceipts(docId);
            });
            menu.appendChild(infoBtn);
        }
// Pin menu — hanya owner
if (isOwnerUser(currentUser?.username)) {
    const isCurrentlyPinned = currentPinnedMessage && currentPinnedMessage.docId === docId;
    const pinBtn = createMenuItem(
        isCurrentlyPinned ? 'Lepas sematan' : 'Sematkan pesan',
        'fa-solid fa-thumbtack',
        'var(--accent)'
    );
    pinBtn.addEventListener('click', function() {
        menu.remove();
        if (isCurrentlyPinned) {
            unpinMessage(docId);
        } else {
            pinMessage(docId);
        }
    });
    menu.appendChild(pinBtn);

    const isAlreadyAdminDeleted = false;
    const deleteAdminBtn = createMenuItem('Hapus untuk semua (admin)', 'fa-solid fa-shield-halved', 'var(--danger)');
    deleteAdminBtn.addEventListener('click', function() {
        menu.remove();
        deleteMessageAsAdmin(docId);
    });
    menu.appendChild(deleteAdminBtn);
}
        if (isMine && canEdit) {
            const editBtn = createMenuItem('Edit pesan', 'fa-solid fa-pen', 'var(--text)');
            editBtn.addEventListener('click', function() {
                menu.remove();
                editMessage(docId, text);
            });
            menu.appendChild(editBtn);
        } else if (isMine && !canEdit) {
            const editBtn = createMenuItem('Edit pesan (tidak tersedia)', 'fa-solid fa-pen', 'var(--text-muted)');
            editBtn.style.opacity = '0.5';
            editBtn.style.cursor = 'not-allowed';
            menu.appendChild(editBtn);
        }

        const deleteMeBtn = createMenuItem('Hapus untuk saya', 'fa-solid fa-trash-can', 'var(--danger)');
        deleteMeBtn.addEventListener('click', function() {
            menu.remove();
            deleteMessageForMe(docId);
        });
        menu.appendChild(deleteMeBtn);

        if (isMine) {
            const deleteAllBtn = createMenuItem('Hapus untuk semua', 'fa-solid fa-trash-can', 'var(--danger)');
            deleteAllBtn.addEventListener('click', function() {
                menu.remove();
                deleteMessageForAll(docId);
            });
            menu.appendChild(deleteAllBtn);
        }

        const closeBtn = createMenuItem('Tutup', 'fa-solid fa-xmark', 'var(--text-muted)');
        closeBtn.style.borderTop = '1px solid var(--border)';
        closeBtn.addEventListener('click', function() { menu.remove(); });
        menu.appendChild(closeBtn);

        document.body.appendChild(menu);

        setTimeout(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        }, 100);
    }

    /* ============================================================
       READ RECEIPTS
    ============================================================ */
    async function showReadReceipts(docId) {
        const db = getDb();
        if (!db) return;
        try {
            const doc = await db.collection('messages').doc(docId).get();
            if (!doc.exists) return;
            const data = doc.data();
            const readBy = data.readBy || {};
            const userIds = Object.keys(readBy);

            const readUsers = [];
            for (const uid of userIds) {
                try {
                    const userDoc = await db.collection('users').doc(uid).get();
                    if (userDoc.exists) {
                        const udata = userDoc.data();
                        const ts = readBy[uid];
                        const time = ts?.toDate ? ts.toDate() : new Date(ts);
                        readUsers.push({
                            username: udata.username || uid,
                            avatar: udata.avatar || '',
                            time: time.toLocaleString('id-ID', {
                                day: '2-digit', month: 'short',
                                hour: '2-digit', minute: '2-digit'
                            })
                        });
                    }
                } catch (e) {}
            }

            const overlay = document.createElement('div');
            overlay.className = 'read-receipt-overlay';

            const items = readUsers.map(u => {
                const initial = (u.username || '?')[0].toUpperCase();
                const avatarUrl = safeImageUrl(u.avatar);
                const avatarHTML = avatarUrl
                    ? '<img src="' + escapeHTML(avatarUrl) + '" alt="">'
                    : escapeHTML(initial);
                return '<div class="read-receipt-item">' +
                    '<div class="read-receipt-avatar">' + avatarHTML + '</div>' +
                    '<div class="read-receipt-info">' +
                    '<div class="read-receipt-name">' + escapeHTML(u.username) + '</div>' +
                    '<div class="read-receipt-time"><i class="fa-regular fa-clock"></i> ' + escapeHTML(u.time) + '</div>' +
                    '</div></div>';
            }).join('');

            const listHTML = readUsers.length === 0
                ? '<div class="read-receipt-empty"><i class="fa-regular fa-eye-slash"></i><p>Belum ada yang membaca pesan ini</p></div>'
                : items;

            overlay.innerHTML =
                '<div class="read-receipt-sheet">' +
                '<div class="read-receipt-handle"></div>' +
                '<div class="read-receipt-header">' +
                '<div class="read-receipt-title"><div class="read-receipt-title-icon"><i class="fa-solid fa-circle-check"></i></div><span>Info Baca</span></div>' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                '<span class="read-receipt-count">' + readUsers.length + ' orang</span>' +
                '<button class="read-receipt-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>' +
                '</div></div>' +
                '<div class="read-receipt-list">' + listHTML + '</div>' +
                '</div>';

            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('active'));

            let isClosed = false;
            function closeReceipt() {
                if (isClosed) return;
                isClosed = true;
                overlay.classList.remove('active');
                setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 300);
            }
            const closeBtn = overlay.querySelector('.read-receipt-close');
            if (closeBtn) closeBtn.addEventListener('click', function(e) { e.stopPropagation(); closeReceipt(); });
            overlay.addEventListener('click', function(e) { if (e.target === overlay) closeReceipt(); });
            const escHandler = function(e) {
                if (e.key === 'Escape') { closeReceipt(); document.removeEventListener('keydown', escHandler); }
            };
            document.addEventListener('keydown', escHandler);
        } catch (error) {
            console.error('Error showReadReceipts:', error);
            showToast('Gagal mengambil data baca', 'error');
        }
    }

    /* ============================================================
       EDIT MESSAGE
    ============================================================ */
    function editMessage(docId, oldText) {
        editingMessageId = docId;
        editingMessageOldText = oldText;
        const modal = document.getElementById('edit-message-modal');
        const input = document.getElementById('edit-message-input');
        const errorEl = document.getElementById('edit-message-error');
        if (!modal || !input || !errorEl) return;
        input.value = oldText;
        errorEl.classList.remove('visible');
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        setTimeout(() => input.focus(), 100);
    }

    function setupEditMessageEvents() {
        const cancelBtn = document.getElementById('edit-message-cancel');
        const saveBtn = document.getElementById('edit-message-save');
        const input = document.getElementById('edit-message-input');
        if (cancelBtn) cancelBtn.addEventListener('click', function() {
            document.getElementById('edit-message-modal').classList.remove('active');
            document.body.classList.remove('modal-open');
            editingMessageId = null;
            editingMessageOldText = '';
        });

        if (saveBtn) saveBtn.addEventListener('click', async function() {
            const db = getDb();
            if (!db) return;
            const inputEl = document.getElementById('edit-message-input');
            const errorEl = document.getElementById('edit-message-error');
            const newText = inputEl.value.trim();
            if (!newText) {
                errorEl.textContent = 'Pesan tidak boleh kosong';
                errorEl.classList.add('visible');
                return;
            }
            if (newText === editingMessageOldText) {
                document.getElementById('edit-message-modal').classList.remove('active');
                document.body.classList.remove('modal-open');
                editingMessageId = null;
                editingMessageOldText = '';
                return;
            }
            try {
                const doc = await db.collection('messages').doc(editingMessageId).get();
                if (!doc.exists) { showToast('Pesan tidak ditemukan', 'error'); return; }
                const data = doc.data();
                const msgTime = data.timestamp ? data.timestamp.toMillis() : 0;
                if (Date.now() - msgTime > 60 * 60 * 1000) {
                    errorEl.textContent = 'Waktu edit sudah habis (1 jam)';
                    errorEl.classList.add('visible');
                    return;
                }
                await db.collection('messages').doc(editingMessageId).update({
                    text: newText,
                    isEdited: true,
                    editedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast('Pesan berhasil diedit', 'success');
                document.getElementById('edit-message-modal').classList.remove('active');
                document.body.classList.remove('modal-open');
                editingMessageId = null;
                editingMessageOldText = '';
            } catch (error) {
                console.error('Error editMessage:', error);
                errorEl.textContent = 'Gagal mengedit pesan';
                errorEl.classList.add('visible');
            }
        });

        if (input) input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('edit-message-save').click();
            }
        });
    }

    /* ============================================================
       DELETE MESSAGE
    ============================================================ */
    async function deleteMessageForMe(docId) {
        const db = getDb();
        if (!db) return;
        try {
            const uid = getMyUid();
            if (!uid) { showToast('Anda belum login', 'error'); return; }
            const doc = await db.collection('messages').doc(docId).get();
            if (!doc.exists) return;
            const data = doc.data();
            if (data.isDeletedForAll) { showToast('Pesan sudah dihapus untuk semua', 'info'); return; }

            const deletedFor = data.deletedFor || [];
            if (!deletedFor.includes(uid)) deletedFor.push(uid);
            await db.collection('messages').doc(docId).update({ deletedFor });
            showToast('Pesan dihapus untuk Anda', 'success');
        } catch (error) {
            console.error('Error deleteMessageForMe:', error);
            showToast('Gagal menghapus pesan', 'error');
        }
    }
async function deleteMessageAsAdmin(docId) {
    if (!isOwnerUser(currentUser?.username)) {
        showToast('Hanya Ekk Store yang bisa hapus sebagai admin', 'warning');
        return;
    }

    const ok = await showConfirmModal(
        'Hapus Sebagai Admin?',
        'Pesan akan dihapus untuk semua orang.\n\n' +
        'Semua user akan lihat: "Pesan ini dihapus oleh admin".\n\n' +
        'Lanjutkan?',
        'Hapus'
    );
    if (!ok) return;

    const db = getDb();
    if (!db) return;

    try {
        await db.collection('messages').doc(docId).update({
            isDeletedByAdmin: true,
            deletedByAdminBy: currentUser.username,
            deletedByAdminAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast('Pesan dihapus oleh admin', 'success');
    } catch (err) {
        console.error('[DeleteAdmin] Error:', err);
        showToast('Gagal: ' + err.message, 'error');
    }
}

    async function deleteMessageForAll(docId) {
        const db = getDb();
        if (!db) return;
        try {
            const ok = await showConfirmModal(
                'Hapus untuk semua?',
                'Pesan akan dihapus untuk semua anggota grup. Lanjutkan?',
                'Hapus'
            );
            if (!ok) return;
            await db.collection('messages').doc(docId).update({
                isDeletedForAll: true,
                text: 'Pesan ini telah dihapus',
                replyTo: null
            });
            showToast('Pesan dihapus untuk semua', 'success');
        } catch (error) {
            console.error('Error deleteMessageForAll:', error);
            showToast('Gagal menghapus pesan', 'error');
        }
    }
    /* ============================================================
       REPLY — swipe gestures
    ============================================================ */
    function startReply(docId, username, text) {
        replyingTo = { docId, username, text };
        const input = document.getElementById('chat-input');
        if (!input) return;
        input.focus();
        input.placeholder = 'Reply to ' + username + '...';
        input.style.borderColor = 'var(--accent)';
        showToast('Reply to ' + username, 'info');

        let cancelBtn = document.getElementById('cancel-reply-btn');
        if (!cancelBtn) {
            cancelBtn = document.createElement('button');
            cancelBtn.id = 'cancel-reply-btn';
            cancelBtn.type = 'button';
            cancelBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            cancelBtn.style.width = '28px';
            cancelBtn.style.height = '28px';
            cancelBtn.style.minWidth = '28px';
            cancelBtn.style.minHeight = '28px';
            cancelBtn.style.background = 'var(--danger)';
            cancelBtn.style.color = '#fff';
            cancelBtn.style.border = 'none';
            cancelBtn.style.borderRadius = '50%';
            cancelBtn.style.fontSize = '12px';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.display = 'flex';
            cancelBtn.style.alignItems = 'center';
            cancelBtn.style.justifyContent = 'center';
            cancelBtn.style.marginLeft = '6px';
            cancelBtn.style.flexShrink = '0';
            cancelBtn.style.transition = 'all 0.2s ease';

            const wrapper = document.querySelector('.chat-input-wrapper');
            if (wrapper) {
                wrapper.insertBefore(cancelBtn, document.getElementById('btn-voice'));
            }
            cancelBtn.addEventListener('click', cancelReply);
        }
        cancelBtn.style.display = 'flex';
    }

    function cancelReply() {
        replyingTo = null;
        const input = document.getElementById('chat-input');
        if (input) {
            input.placeholder = 'Ketik pesan...';
            input.style.borderColor = 'var(--border)';
        }
        const cancelBtn = document.getElementById('cancel-reply-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
    }

    function setupSwipeToReply() {
        const container = document.getElementById('messages-list');
        if (!container) return;

        let swipeStartX = 0, swipeStartY = 0, swipeTargetElement = null, swipeCurrentX = 0, swipeCurrentY = 0;

        container.addEventListener('touchstart', function(e) {
            const target = e.target.closest('.message-item');
            if (!target) return;
            if (target.classList.contains('system') || target.classList.contains('pending')) return;
            swipeTargetElement = target;
            swipeStartX = e.touches[0].clientX;
            swipeStartY = e.touches[0].clientY;
            swipeCurrentX = swipeStartX;
            swipeCurrentY = swipeStartY;
            target.style.transition = 'transform 0s';
        }, { passive: true });

        container.addEventListener('touchmove', function(e) {
            if (!swipeTargetElement) return;
            const touch = e.touches[0];
            const dx = touch.clientX - swipeStartX;
            const dy = touch.clientY - swipeStartY;
            swipeCurrentX = touch.clientX;
            swipeCurrentY = touch.clientY;
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
                swipeTargetElement.style.transform = '';
                swipeTargetElement.style.background = '';
                return;
            }
            if (Math.abs(dx) > 10) {
                if (dx > 0) {
                    const t = Math.min(dx, 80);
                    swipeTargetElement.style.transform = 'translateX(' + t + 'px)';
                    swipeTargetElement.style.background = 'rgba(249, 115, 22, 0.1)';
                    swipeTargetElement.style.borderRadius = '8px';
                } else {
                    const t = Math.max(dx, -80);
                    swipeTargetElement.style.transform = 'translateX(' + t + 'px)';
                    swipeTargetElement.style.background = 'rgba(240, 97, 107, 0.1)';
                    swipeTargetElement.style.borderRadius = '8px';
                }
            }
        }, { passive: true });

        container.addEventListener('touchend', function() {
            if (!swipeTargetElement) return;
            const dx = swipeCurrentX - swipeStartX;
            const dy = swipeCurrentY - swipeStartY;
            swipeTargetElement.style.transition = 'transform 0.3s';
            swipeTargetElement.style.transform = '';
            swipeTargetElement.style.background = '';
            if (dx > 50 && Math.abs(dx) > Math.abs(dy)) {
                const docId = swipeTargetElement.dataset.docId;
                const username = swipeTargetElement.dataset.username;
                const text = swipeTargetElement.dataset.text;
                if (docId) {
                    startReply(docId, username, text);
                    if (navigator.vibrate) navigator.vibrate(10);
                }
            }
            swipeTargetElement = null;
        }, { passive: true });

        // Mouse
        let isDragging = false, mouseStartX = 0, mouseStartY = 0, mouseTarget = null, mouseCurrentX = 0, mouseCurrentY = 0;
        container.addEventListener('mousedown', function(e) {
            const target = e.target.closest('.message-item');
            if (!target) return;
            if (target.classList.contains('system') || target.classList.contains('pending')) return;
            isDragging = true;
            mouseTarget = target;
            mouseStartX = e.clientX;
            mouseStartY = e.clientY;
            mouseCurrentX = mouseStartX;
            mouseCurrentY = mouseStartY;
            target.style.transition = 'transform 0s';
        });
        document.addEventListener('mousemove', function(e) {
            if (!isDragging || !mouseTarget) return;
            const dx = e.clientX - mouseStartX;
            const dy = e.clientY - mouseStartY;
            mouseCurrentX = e.clientX;
            mouseCurrentY = e.clientY;
            if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
                mouseTarget.style.transform = '';
                return;
            }
            if (Math.abs(dx) > 10) {
                if (dx > 0) {
                    mouseTarget.style.transform = 'translateX(' + Math.min(dx, 80) + 'px)';
                    mouseTarget.style.background = 'rgba(249, 115, 22, 0.1)';
                } else {
                    mouseTarget.style.transform = 'translateX(' + Math.max(dx, -80) + 'px)';
                    mouseTarget.style.background = 'rgba(240, 97, 107, 0.1)';
                }
            }
        });
        document.addEventListener('mouseup', function() {
            if (!isDragging || !mouseTarget) { isDragging = false; return; }
            const dx = mouseCurrentX - mouseStartX;
            const dy = mouseCurrentY - mouseStartY;
            mouseTarget.style.transition = 'transform 0.3s';
            mouseTarget.style.transform = '';
            mouseTarget.style.background = '';
            if (dx > 50 && Math.abs(dx) > Math.abs(dy)) {
                const docId = mouseTarget.dataset.docId;
                const username = mouseTarget.dataset.username;
                const text = mouseTarget.dataset.text;
                if (docId) startReply(docId, username, text);
            }
            isDragging = false;
            mouseTarget = null;
        });
    }

    /* ============================================================
       SUBSCRIBE USERS (member panel + online count)
    ============================================================ */
    function subscribeUsers() {
    const db = getDb();
    if (!db) return;
    if (usersUnsubscribe) {
        try { usersUnsubscribe(); } catch(e) {}
        usersUnsubscribe = null;
    }
    usersUnsubscribe = db.collection('users').onSnapshot(snapshot => {
        let online = 0;
        allUsersCache = [];
        let myDocExists = false;

        snapshot.forEach(doc => {
            const d = doc.data();
            if (d.isOnline === true) online++;
            window._userAvatarCache[doc.id] = {
                username: d.username || '',
                avatar: d.avatar || '',
                avatarUpdatedAt: d.avatarUpdatedAt || null,
                avatarUpdatedAtMs: d.avatarUpdatedAtMs || null
            };
            allUsersCache.push({
                uid: doc.id,
                username: d.username || '',
                avatar: d.avatar || '',
                isOnline: d.isOnline === true,
                lastSeen: d.lastSeen || null
            });

            if (currentUser && doc.id === currentUser.uid) {
                myDocExists = true;
            }
        });

        const total = snapshot.size;
        const groupInfo = document.getElementById('group-info');
        if (groupInfo) groupInfo.textContent = total + ' anggota · ' + online + ' online';

        const totalEl = document.getElementById('member-total-stat');
        const onlineEl = document.getElementById('member-online-stat');
        if (totalEl) totalEl.textContent = total + ' anggota';
        if (onlineEl) onlineEl.textContent = online + ' online';

        if (memberPanelOpen) renderMemberPanel();

        // ⬇️ DETEKSI: kalau currentUser udah gak ada di list → auto logout
        if (currentUser && !myDocExists) {
            console.log('[Member] User sendiri dihapus oleh owner');
            handleSelfLogout();
        }
    }, (error) => {
        console.error('Error listening users:', error);
    });
}

/* ============================================================
   SELF LOGOUT — dipanggil kalau user dihapus oleh owner
============================================================ */
function handleSelfLogout() {
    // Unsubscribe listener dulu biar gak dobel trigger
    if (usersUnsubscribe) {
        try { usersUnsubscribe(); } catch(e) {}
        usersUnsubscribe = null;
    }
    if (messagesUnsubscribe) {
        try { messagesUnsubscribe(); } catch(e) {}
        messagesUnsubscribe = null;
    }
    if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
    }

    // Clear state
    currentUser = null;

    // Clear localStorage
    try {
        localStorage.removeItem('ekk_group_user');
    } catch (e) {}

    // Close chat-open class
    document.documentElement.classList.remove('chat-open');
    document.body.classList.remove('chat-open');

    // Show toast + info
    showToast('Anda telah dikeluarkan dari grup oleh owner', 'warning');

    // Balik ke form "Buat Profil"
    setTimeout(() => {
        showProfileSetup();
        // Reset input fields
        const newUsernameInput = document.getElementById('new-username');
        const avatarInput = document.getElementById('avatar-input');
        const avatarPreview = document.getElementById('avatar-preview');
        const usernameError = document.getElementById('username-error');
        const avatarError = document.getElementById('avatar-error');
        const usernameCheckIcon = document.getElementById('username-check-icon');

        if (newUsernameInput) newUsernameInput.value = '';
        if (avatarInput) avatarInput.value = '';
        if (avatarPreview) avatarPreview.innerHTML = '<i class="fa-solid fa-user"></i>';
        if (usernameError) {
            usernameError.textContent = '';
            usernameError.classList.remove('visible');
        }
        if (avatarError) {
            avatarError.textContent = '';
            avatarError.classList.remove('visible');
        }
        if (usernameCheckIcon) {
            usernameCheckIcon.className = 'username-status-icon';
            usernameCheckIcon.innerHTML = '';
        }
        uploadedAvatarUrl = '';
    }, 600);
}

    /* ============================================================
       MEMBER PANEL
    ============================================================ */
    function openMemberPanel() {
        const panel = document.getElementById('member-panel');
        const backdrop = document.getElementById('member-panel-backdrop');
        if (!panel) return;
        memberPanelOpen = true;
        panel.classList.add('open');
        if (backdrop) backdrop.classList.add('active');
        document.body.classList.add('modal-open');
        renderMemberPanel();
    }

    function closeMemberPanel() {
        const panel = document.getElementById('member-panel');
        const backdrop = document.getElementById('member-panel-backdrop');
        if (!panel) return;
        memberPanelOpen = false;
        panel.classList.remove('open');
        if (backdrop) backdrop.classList.remove('active');
        document.body.classList.remove('modal-open');
    }

    function renderMemberPanel() {
        const list = document.getElementById('member-list');
        if (!list) return;
        const searchInput = document.getElementById('member-panel-search-input');
        const query = (searchInput?.value || '').trim().toLowerCase();

        let users = allUsersCache.slice();
        if (query) {
            users = users.filter(u => (u.username || '').toLowerCase().includes(query));
        }
        // Sort: online dulu, kemudian alfabetis
        users.sort((a, b) => {
            if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
            return (a.username || '').localeCompare(b.username || '', 'id', { sensitivity: 'base' });
        });

        if (users.length === 0) {
            list.innerHTML = '<div class="member-empty"><i class="fa-solid fa-users"></i><p>' +
                (query ? 'Tidak ada anggota yang cocok' : 'Belum ada anggota') +
                '</p></div>';
            return;
        }

        const onlineUsers = users.filter(u => u.isOnline);
        const offlineUsers = users.filter(u => !u.isOnline);
        const myUid = getMyUid();

        const iAmOwner = isOwnerUser(currentUser?.username);

function renderUserRow(u, isMe) {
    const initial = (u.username || '?')[0].toUpperCase();
    const avatarUrl = safeImageUrl(u.avatar);
    const avatarHTML = avatarUrl
        ? '<img src="' + escapeHTML(avatarUrl) + '" alt="">'
        : escapeHTML(initial);

    const metaText = u.isOnline ? '<span class="online-txt">Online</span>' : 'Offline';
    const youTag = isMe ? '<span class="you-tag">Anda</span>' : '';

    // Owner bisa hapus member, TAPI gak bisa hapus diri sendiri
    const canDelete = iAmOwner && !isMe;

    const deleteBtnHTML = '<button class="member-row-delete" ' +
        'data-uid="' + escapeHTML(u.uid) + '" ' +
        'data-username="' + escapeHTML(u.username || 'unknown') + '" ' +
        'aria-label="Hapus member" title="Hapus member">' +
        '<i class="fa-solid fa-trash"></i>' +
        '</button>';

    return '<div class="member-row' + (canDelete ? ' can-delete' : '') + '">' +
        '<div class="member-row-avatar-wrap">' +
        '<div class="member-row-avatar">' + avatarHTML + '</div>' +
        '<span class="member-row-status ' + (u.isOnline ? 'online' : 'offline') + '"></span>' +
        '</div>' +
        '<div class="member-row-info">' +
        '<div class="member-row-name">' + escapeHTML(u.username || 'unknown') + youTag + '</div>' +
        '<div class="member-row-meta">' + metaText + '</div>' +
        '</div>' +
        (canDelete ? deleteBtnHTML : '') +
        '</div>';
}

        let html = '';
        if (onlineUsers.length > 0) {
            html += '<div class="member-list-section-label">Online — ' + onlineUsers.length + '</div>';
            onlineUsers.forEach(u => { html += renderUserRow(u, u.uid === myUid); });
        }
        if (offlineUsers.length > 0) {
            html += '<div class="member-list-section-label">Offline — ' + offlineUsers.length + '</div>';
            offlineUsers.forEach(u => { html += renderUserRow(u, u.uid === myUid); });
        }
        list.innerHTML = html;
    }
/* ============================================================
   HAPUS MEMBER — hanya owner
============================================================ */
async function handleDeleteMember(uid, username) {
    if (!isOwnerUser(currentUser?.username)) {
        showToast('Hanya Ekk Store yang bisa hapus member', 'warning');
        return;
    }

    if (uid === currentUser?.uid) {
        showToast('Tidak bisa hapus diri sendiri', 'warning');
        return;
    }

    const ok = await showConfirmModal(
        'Hapus Member + Pesan?',
        'User "' + username + '" akan dihapus dari grup.\n\n' +
        'SEMUA pesan mereka juga akan dihapus dari chat.\n' +
        'Tidak bisa dibatalkan.\n\n' +
        'Lanjutkan?',
        'Hapus Semua'
    );
    if (!ok) return;

    const db = getDb();
    if (!db) {
        showToast('DB belum siap', 'error');
        return;
    }

    showToast('Menghapus member dan pesannya...', 'info');

    try {
        let totalDeleted = 0;
        let hasMore = true;

        while (hasMore) {
            const snap = await db.collection('messages')
                .where('senderId', '==', uid)
                .limit(400)
                .get();

            if (snap.empty) {
                hasMore = false;
                break;
            }

            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += snap.size;

            if (snap.size < 400) hasMore = false;
        }

        let hasMoreLegacy = true;
        while (hasMoreLegacy) {
            const snap = await db.collection('messages')
                .where('uid', '==', uid)
                .limit(400)
                .get();

            if (snap.empty) {
                hasMoreLegacy = false;
                break;
            }

            const batch = db.batch();
            snap.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += snap.size;

            if (snap.size < 400) hasMoreLegacy = false;
        }

        await db.collection('users').doc(uid).delete();

        try {
            await db.collection('typing').doc(uid).delete();
        } catch (e) {}

        if (uid === currentUser?.uid) {
            handleSelfLogout();
            return;
        }

        showToast('Member "' + username + '" + ' + totalDeleted + ' pesan dihapus', 'success');

    } catch (err) {
        console.error('[DeleteMember] Error:', err);
        showToast('Gagal hapus member: ' + err.message, 'error');
    }
}
    function setupMemberPanelEvents() {
    const openBtn = document.getElementById('btn-open-members');
    if (openBtn) openBtn.addEventListener('click', openMemberPanel);

    const closeBtn = document.getElementById('member-panel-close');
    if (closeBtn) closeBtn.addEventListener('click', closeMemberPanel);

    const backdrop = document.getElementById('member-panel-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeMemberPanel);

    const searchInput = document.getElementById('member-panel-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => renderMemberPanel(), 200));
    }

    // Event delegation — handle tombol hapus member
    const memberList = document.getElementById('member-list');
    if (memberList) {
        memberList.addEventListener('click', function(e) {
            const btn = e.target.closest('.member-row-delete');
            if (!btn) return;
            e.stopPropagation();

            const targetUid = btn.dataset.uid;
            const targetUsername = btn.dataset.username || 'user ini';

            handleDeleteMember(targetUid, targetUsername);
        });
    }
}

    /* ============================================================
       CHAT SEARCH
    ============================================================ */
    function openChatSearch() {
        const bar = document.getElementById('chat-search-bar');
        const input = document.getElementById('chat-search-input');
        if (!bar || !input) return;
        chatSearchActive = true;
        bar.classList.add('visible');
        setTimeout(() => input.focus(), 100);
    }

    function closeChatSearch() {
        const bar = document.getElementById('chat-search-bar');
        const input = document.getElementById('chat-search-input');
        if (!bar) return;
        chatSearchActive = false;
        bar.classList.remove('visible');
        if (input) input.value = '';
        chatSearchQuery = '';
        chatSearchMatches = [];
        chatSearchIndex = 0;
        // Reset visual
        document.querySelectorAll('.message-item.search-hidden').forEach(el => el.classList.remove('search-hidden'));
        document.querySelectorAll('.message-item.search-highlight').forEach(el => el.classList.remove('search-highlight'));
        const countEl = document.getElementById('chat-search-count');
        if (countEl) countEl.textContent = '0/0';
    }

    function performChatSearch(query) {
        chatSearchQuery = (query || '').trim().toLowerCase();
        document.querySelectorAll('.message-item.search-hidden').forEach(el => el.classList.remove('search-hidden'));
        document.querySelectorAll('.message-item.search-highlight').forEach(el => el.classList.remove('search-highlight'));
        chatSearchMatches = [];

        if (!chatSearchQuery) {
            const countEl = document.getElementById('chat-search-count');
            if (countEl) countEl.textContent = '0/0';
            return;
        }

        const list = document.getElementById('messages-list');
        if (!list) return;

        document.querySelectorAll('.message-item[data-doc-id]').forEach(el => {
            const text = (el.dataset.text || '').toLowerCase();
            if (text.includes(chatSearchQuery)) {
                chatSearchMatches.push(el);
            } else {
                el.classList.add('search-hidden');
            }
        });

        // Sort by DOM order
        chatSearchMatches.sort((a, b) => {
            return Array.from(list.children).indexOf(a) - Array.from(list.children).indexOf(b);
        });

        chatSearchIndex = chatSearchMatches.length > 0 ? 0 : -1;
        updateChatSearchUI();
        if (chatSearchIndex >= 0) {
            jumpToSearchMatch(chatSearchIndex);
        }
    }

    function updateChatSearchUI() {
        const countEl = document.getElementById('chat-search-count');
        if (!countEl) return;
        if (chatSearchMatches.length === 0) {
            countEl.textContent = chatSearchQuery ? '0/0' : '0/0';
        } else {
            countEl.textContent = (chatSearchIndex + 1) + '/' + chatSearchMatches.length;
        }
        const prevBtn = document.getElementById('chat-search-prev');
        const nextBtn = document.getElementById('chat-search-next');
        if (prevBtn) prevBtn.disabled = chatSearchMatches.length === 0;
        if (nextBtn) nextBtn.disabled = chatSearchMatches.length === 0;
    }

    function jumpToSearchMatch(index) {
        if (index < 0 || index >= chatSearchMatches.length) return;
        chatSearchMatches.forEach(el => el.classList.remove('search-highlight'));
        const el = chatSearchMatches[index];
        el.classList.add('search-highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function setupChatSearchEvents() {
        const openBtn = document.getElementById('btn-open-search');
        if (openBtn) openBtn.addEventListener('click', openChatSearch);

        const closeBtn = document.getElementById('chat-search-close');
        if (closeBtn) closeBtn.addEventListener('click', closeChatSearch);

        const input = document.getElementById('chat-search-input');
        if (input) {
            const debounced = debounce(() => performChatSearch(input.value), 250);
            input.addEventListener('input', debounced);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (chatSearchMatches.length === 0) return;
                    chatSearchIndex = (chatSearchIndex + 1) % chatSearchMatches.length;
                    updateChatSearchUI();
                    jumpToSearchMatch(chatSearchIndex);
                } else if (e.key === 'Escape') {
                    closeChatSearch();
                }
            });
        }

        const prevBtn = document.getElementById('chat-search-prev');
        if (prevBtn) prevBtn.addEventListener('click', function() {
            if (chatSearchMatches.length === 0) return;
            chatSearchIndex = (chatSearchIndex - 1 + chatSearchMatches.length) % chatSearchMatches.length;
            updateChatSearchUI();
            jumpToSearchMatch(chatSearchIndex);
        });

        const nextBtn = document.getElementById('chat-search-next');
        if (nextBtn) nextBtn.addEventListener('click', function() {
            if (chatSearchMatches.length === 0) return;
            chatSearchIndex = (chatSearchIndex + 1) % chatSearchMatches.length;
            updateChatSearchUI();
            jumpToSearchMatch(chatSearchIndex);
        });

        // Ctrl+K global
        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                if (currentPage === 'group') {
                    e.preventDefault();
                    if (chatSearchActive) closeChatSearch();
                    else openChatSearch();
                }
            }
        });
    }

    /* ============================================================
       SCROLL LISTENER (auto load older + scroll button)
    ============================================================ */
    function setupScrollListener() {
    const list = document.getElementById('messages-list');
    const btn = document.getElementById('scroll-bottom-btn');
    if (!list) return;

    list.addEventListener('scroll', function() {
        // ⬇️ Auto-hide reaction bar saat scroll
        document.querySelectorAll('.reaction-bar').forEach(b => b.remove());

        isUserNearBottom = isNearBottom();
    if (isUserNearBottom && unreadCount > 0) {
        unreadCount = 0;
        updateBottomNavBadge();
    }
    updateScrollButton();

    // Load older kalau scroll ke atas
    if (list.scrollTop < 80) loadOlderMessages();

    // Mark read kalau user scroll ke bawah (throttle 3 detik)
    if (isUserNearBottom) {
        const now = Date.now();
        if (!list._lastReadMark || now - list._lastReadMark > 3000) {
            list._lastReadMark = now;
            markChatAsRead();
        }
    }
}, { passive: true });

        if (btn) {
            btn.addEventListener('click', function() {
                unreadCount = 0;
                isUserNearBottom = true;
                scrollToBottom(true);
                updateScrollButton();
                updateBottomNavBadge();
            });
        }
    }

    /* ============================================================
       ATTACH / PREVIEW BAR
    ============================================================ */
    function renderPreviewBar() {
        const bar = document.getElementById('media-preview-bar');
        if (!bar) return;
        bar.innerHTML = '';
        if (pendingFiles.length === 0) {
            bar.classList.remove('visible');
            updateSendButtonVisibility();
            return;
        }
        bar.classList.add('visible');
        pendingFiles.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'media-preview-item';

            if (item.type === 'image') {
                const img = document.createElement('img');
                img.src = item.previewUrl;
                img.alt = 'preview';
                div.appendChild(img);
            } else if (item.type === 'video') {
                const video = document.createElement('video');
                video.src = item.previewUrl;
                video.muted = true;
                video.playsInline = true;
                video.preload = 'metadata';
                div.appendChild(video);
                const badge = document.createElement('span');
                badge.className = 'preview-video-badge';
                badge.innerHTML = '<i class="fa-solid fa-video"></i>';
                div.appendChild(badge);
            } else if (item.type === 'audio') {
                div.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--accent);font-size:22px;"><i class="fa-solid fa-microphone"></i></div>';
            } else {
                div.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;color:var(--accent);font-size:22px;"><i class="fa-solid fa-file-lines"></i></div>';
            }

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'preview-remove';
            removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            removeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                try { URL.revokeObjectURL(item.previewUrl); } catch(e) {}
                pendingFiles.splice(index, 1);
                renderPreviewBar();
            });
            div.appendChild(removeBtn);
            bar.appendChild(div);
        });
        updateSendButtonVisibility();
    }

    function updateSendButtonVisibility() {
        const btnSend = document.getElementById('btn-send');
        const btnVoice = document.getElementById('btn-voice');
        const input = document.getElementById('chat-input');
        if (!btnSend || !btnVoice) return;
        const hasText = (input?.value || '').trim().length > 0;
        const hasFiles = pendingFiles.length > 0;
        if (hasText || hasFiles) {
            btnSend.style.display = 'flex';
            btnVoice.style.display = 'none';
        } else {
            btnSend.style.display = 'none';
            btnVoice.style.display = 'flex';
        }
    }

    /* ============================================================
       FILE INPUTS
    ============================================================ */
    function setupFileInputs() {
        const chatFileInput = document.getElementById('file-input');
        const fileInputDocument = document.getElementById('file-input-document');
        const fileInputCamera = document.getElementById('file-input-camera');

        if (chatFileInput) {
            chatFileInput.addEventListener('change', function() {
                if (!this.files.length) return;
                for (const file of this.files) {
                    if (file.size > 20 * 1024 * 1024) {
                        showToast(file.name + ' terlalu besar (maks 20MB)', 'error');
                        continue;
                    }
                    let type = 'file';
                    if (file.type.startsWith('image/')) type = 'image';
                    else if (file.type.startsWith('video/')) type = 'video';
                    else if (file.type.startsWith('audio/')) type = 'audio';
                    pendingFiles.push({ file, previewUrl: URL.createObjectURL(file), type });
                }
                this.value = '';
                renderPreviewBar();
            });
        }

        if (fileInputDocument) {
            fileInputDocument.addEventListener('change', function() {
                if (!this.files.length) return;
                for (const file of this.files) {
                    if (file.size > 50 * 1024 * 1024) {
                        showToast(file.name + ' terlalu besar (maks 50MB)', 'error');
                        continue;
                    }
                    pendingFiles.push({
                        file,
                        previewUrl: URL.createObjectURL(file),
                        type: 'document'
                    });
                }
                this.value = '';
                renderPreviewBar();
            });
        }

        if (fileInputCamera) {
            fileInputCamera.addEventListener('change', function() {
                if (!this.files.length) return;
                for (const file of this.files) {
                    if (file.size > 20 * 1024 * 1024) {
                        showToast(file.name + ' terlalu besar (maks 20MB)', 'error');
                        continue;
                    }
                    let type = 'file';
                    if (file.type.startsWith('image/')) type = 'image';
                    else if (file.type.startsWith('video/')) type = 'video';
                    pendingFiles.push({ file, previewUrl: URL.createObjectURL(file), type });
                }
                this.value = '';
                renderPreviewBar();
            });
        }
    }

    /* ============================================================
       ATTACH MENU
    ============================================================ */
    function setupAttachMenu() {
        const attachBtn = document.getElementById('btn-attach');
        const overlay = document.getElementById('attach-menu-overlay');

        function openAttachMenu() {
            if (overlay) overlay.classList.add('active');
        }
        function closeAttachMenu() {
            if (overlay) overlay.classList.remove('active');
        }

        if (attachBtn) attachBtn.addEventListener('click', openAttachMenu);
        if (overlay) overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeAttachMenu();
        });

        document.querySelectorAll('.attach-option').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const action = this.dataset.attach;
                if (action === 'document') {
                    document.getElementById('file-input-document')?.click();
                    closeAttachMenu();
                } else if (action === 'gallery') {
                    document.getElementById('file-input')?.click();
                    closeAttachMenu();
                } else if (action === 'camera') {
                    closeAttachMenu();
                    openInAppCamera();
                } else {
                    const lbl = this.querySelector('.attach-option-label');
                    showToast((lbl?.textContent || 'Fitur') + ' belum tersedia', 'info');
                }
            });
        });

        const attachCameraBtn = document.getElementById('attach-camera-btn');
        if (attachCameraBtn) {
            attachCameraBtn.addEventListener('click', function() {
                closeAttachMenu();
                openInAppCamera();
            });
        }
    }

    /* ============================================================
       SEND TEXT
    ============================================================ */
    function setupSendButton() {
        const btnSend = document.getElementById('btn-send');
        const chatInput = document.getElementById('chat-input');
        if (!btnSend) return;

        btnSend.addEventListener('click', async function() {
            const text = (chatInput?.value || '').trim();
            const hasFiles = pendingFiles.length > 0;

            if (!text && !hasFiles) return;

            if (hasFiles) {
                await sendPendingMedia(text);
                updateSendButtonVisibility();
                return;
            }
            if (!text) return;
            if (!currentUser) {
                showToast('Buat profil dulu di halaman Grup', 'warning');
                return;
            }

            let replyData = null;
            if (replyingTo) {
                replyData = {
                    docId: replyingTo.docId,
                    username: replyingTo.username,
                    text: replyingTo.text
                };
            }

            const pid = 'pending_text_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

            pendingMessages.push({
                id: pid,
                type: 'text',
                text: text,
                replyTo: replyData,
                username: currentUser.username,
                avatar: currentUser.avatar || '',
                uploading: true
            });

            if (chatInput) chatInput.value = '';
            cancelReply();
            updateSendButtonVisibility();

            renderPending();
            requestAnimationFrame(() => scrollToBottom(false));

            try {
                const ok = await sendMessage(text, replyData, null);
                if (!ok) showToast('Gagal mengirim pesan', 'error');
            } catch (err) {
                console.error('Send error:', err);
                showToast('Gagal mengirim pesan', 'error');
            } finally {
                setTimeout(() => {
                    removePendingById(pid);
                }, 2000);
            }
        });

        if (chatInput) {
            chatInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    btnSend.click();
                }
            });
            chatInput.addEventListener('input', function() {
                updateSendButtonVisibility();
                onInputTyping();
            });
            chatInput.addEventListener('blur', function() {
                clearTimeout(typingCleanupTimer);
                clearTyping();
            });
        }
    }

    /* ============================================================
       SEND PENDING MEDIA
    ============================================================ */
    async function sendPendingMedia(text) {
        if (pendingFiles.length === 0) return;
        if (!currentUser) {
            showToast('Buat profil dulu di halaman Grup', 'warning');
            return;
        }

        const filesToSend = [...pendingFiles];
        pendingFiles = [];
        renderPreviewBar();
        const chatInput = document.getElementById('chat-input');
        if (chatInput) chatInput.value = '';
        cancelReply();
        updateSendButtonVisibility();

        const pendingIds = [];
        for (let i = 0; i < filesToSend.length; i++) {
            const item = filesToSend[i];
            const p = {
                id: 'pending_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 6),
                type: item.type,
                previewUrl: item.previewUrl,
                fileName: item.file.name,
                text: (i === 0 && text) ? text : '',
                uploading: true
            };
            pendingMessages.push(p);
            pendingIds.push(p.id);
        }
        renderPending();
        requestAnimationFrame(() => scrollToBottom(false));

        for (let i = 0; i < filesToSend.length; i++) {
            const item = filesToSend[i];
            const pid = pendingIds[i];
            try {
                const mediaUrl = await uploadMediaToCloudinary(item.file);
                let mediaType = item.type;
                if (mediaType === 'document') mediaType = 'file';
                const media = {
                    mediaUrl: mediaUrl,
                    mediaType: mediaType,
                    fileName: item.file.name,
                    fileSize: item.file.size
                };
                const ok = await sendMessage((i === 0 && text) ? text : '', null, media);
                if (!ok) showToast('Gagal kirim ' + item.file.name, 'error');
            } catch (err) {
                console.error('Upload error:', err);
                showToast('Gagal upload ' + item.file.name, 'error');
            } finally {
                setTimeout(() => removePendingById(pid), 1500);
            }
        }

        showToast('File terkirim', 'success');
    }

    /* ============================================================
       VOICE NOTE
    ============================================================ */
    function setupVoiceNote() {
        const btnVoice = document.getElementById('btn-voice');
        const voiceBar = document.getElementById('voice-recording-bar');
        const recordTimeEl = document.getElementById('record-time');
        const voiceCancelBtn = document.getElementById('voice-cancel-btn');
        const chatInputEl = document.getElementById('chat-input');

        if (!btnVoice) return;

        function startRecording() {
            if (!currentUser) {
                showToast('Buat profil dulu di halaman Grup', 'warning');
                return;
            }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                showToast('Browser tidak mendukung perekaman suara', 'error');
                return;
            }

            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                let mimeType = '';
                const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
                for (const t of candidates) {
                    if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
                }
                mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
                audioChunks = [];
                recordCancelled = false;

                mediaRecorder.addEventListener('dataavailable', function(e) {
                    if (e.data.size > 0) audioChunks.push(e.data);
                });

                mediaRecorder.addEventListener('stop', async function() {
                    stream.getTracks().forEach(t => t.stop());
                    if (recordCancelled) { audioChunks = []; return; }
                    const durationMs = Date.now() - recordStartTime;
                    if (durationMs < 1000) {
                        showToast('Rekaman terlalu pendek', 'warning');
                        audioChunks = [];
                        return;
                    }
                    const blobType = mediaRecorder.mimeType || 'audio/webm';
                    const audioBlob = new Blob(audioChunks, { type: blobType });
                    audioChunks = [];
                    await sendVoiceNote(audioBlob, durationMs);
                });

                mediaRecorder.start();
                isRecording = true;
                recordStartTime = Date.now();

                if (window._releaseWhileStarting) {
                    window._releaseWhileStarting = false;
                    setTimeout(() => { if (isRecording) stopRecording(false); }, 50);
                }

                btnVoice.classList.add('recording');
                if (voiceBar) voiceBar.classList.add('visible');
                if (chatInputEl) chatInputEl.style.display = 'none';
                btnVoice.style.display = 'none';

                recordTimerInterval = setInterval(() => {
                    if (recordTimeEl) recordTimeEl.textContent = formatDurationMs(Date.now() - recordStartTime);
                }, 200);
            }).catch(err => {
                console.error('Mic error:', err);
                showToast('Gagal akses mic: ' + (err.message || 'error'), 'error');
                isRecording = false;
            });
        }

        function stopRecording(cancelled) {
            if (!isRecording || !mediaRecorder) return;
            recordCancelled = !!cancelled;
            try { mediaRecorder.stop(); } catch (e) {}
            isRecording = false;
            if (recordTimerInterval) {
                clearInterval(recordTimerInterval);
                recordTimerInterval = null;
            }
            btnVoice.classList.remove('recording');
            if (voiceBar) voiceBar.classList.remove('visible');
            if (chatInputEl) chatInputEl.style.display = '';
            if (recordTimeEl) recordTimeEl.textContent = '0:00';
            updateSendButtonVisibility();
        }

        async function sendVoiceNote(blob, durationMs) {
            if (!currentUser) return;
            const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
            const file = new File([blob], 'voice_' + Date.now() + '.' + ext, { type: blob.type });
            const previewUrl = URL.createObjectURL(blob);

            const pid = 'pending_voice_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            pendingMessages.push({
                id: pid,
                type: 'audio',
                previewUrl: previewUrl,
                fileName: file.name,
                uploading: true
            });
            renderPending();
            requestAnimationFrame(() => scrollToBottom(false));

            try {
                const mediaUrl = await uploadMediaToCloudinary(file);
                const media = {
                    mediaUrl: mediaUrl,
                    mediaType: 'audio',
                    fileName: file.name,
                    fileSize: file.size,
                    duration: durationMs
                };
                const ok = await sendMessage('', null, media);
                if (!ok) showToast('Gagal kirim pesan suara', 'error');
                else showToast('Pesan suara terkirim', 'success');
            } catch (err) {
                console.error('Voice send error:', err);
                showToast('Gagal mengirim: ' + err.message, 'error');
            } finally {
                setTimeout(() => removePendingById(pid), 1500);
            }
        }

        // Support touch & mouse
        const onPressStart = function(e) {
            e.preventDefault();
            window._voiceBtnPressed = true;
            startRecording();
        };
        const onPressEnd = function(e) {
            if (!isRecording) return;
            e.preventDefault();
            stopRecording(false);
        };

        btnVoice.addEventListener('mousedown', onPressStart);
        btnVoice.addEventListener('touchstart', onPressStart, { passive: false });

        document.addEventListener('mouseup', function(e) {
            if (window._voiceBtnPressed && !isRecording) window._releaseWhileStarting = true;
            window._voiceBtnPressed = false;
            onPressEnd(e);
        });
        document.addEventListener('touchend', function(e) {
            if (window._voiceBtnPressed && !isRecording) window._releaseWhileStarting = true;
            window._voiceBtnPressed = false;
            onPressEnd(e);
        });

        if (voiceCancelBtn) {
            voiceCancelBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (isRecording) stopRecording(true);
            });
        }
    }

    /* ============================================================
       CAMERA IN-APP
    ============================================================ */
    function openInAppCamera() {
        if (!currentUser) {
            showToast('Buat profil dulu di halaman Grup', 'warning');
            return;
        }
        const overlay = document.getElementById('camera-overlay');
        const video = document.getElementById('camera-preview');
        const placeholder = document.getElementById('camera-placeholder');
        if (!overlay || !video) return;

        document.querySelectorAll('.camera-mode-btn').forEach(b => b.classList.remove('active'));
        const photoBtn = document.querySelector('.camera-mode-btn[data-mode="photo"]');
        if (photoBtn) photoBtn.classList.add('active');
        inAppCamera.mode = 'photo';
        inAppCamera.isRecordingVideo = false;
        inAppCamera.recordedChunks = [];

        const shutter = document.getElementById('camera-shutter');
        if (shutter) shutter.classList.remove('recording');
        const timerEl = document.getElementById('camera-timer');
        if (timerEl) timerEl.classList.remove('visible');

        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (inAppCamera.stream) {
            inAppCamera.stream.getTracks().forEach(t => t.stop());
            inAppCamera.stream = null;
        }

        navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: inAppCamera.facingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        }).then(stream => {
            inAppCamera.stream = stream;
            video.srcObject = stream;
            video.style.display = '';
            if (placeholder) placeholder.style.display = 'none';
            video.play().catch(() => {});
        }).catch(err => {
            console.error('Camera error:', err);
            video.style.display = 'none';
            if (placeholder) placeholder.style.display = 'flex';
            showToast('Gagal buka kamera: ' + (err.message || 'error'), 'error');
        });
    }

    function closeInAppCamera() {
        const overlay = document.getElementById('camera-overlay');
        const video = document.getElementById('camera-preview');
        if (!overlay) return;
        if (inAppCamera.isRecordingVideo && inAppCamera.mediaRecorder) {
            try { inAppCamera.mediaRecorder.stop(); } catch(e) {}
        }
        if (inAppCamera.timerInterval) {
            clearInterval(inAppCamera.timerInterval);
            inAppCamera.timerInterval = null;
        }
        if (inAppCamera.stream) {
            inAppCamera.stream.getTracks().forEach(t => t.stop());
            inAppCamera.stream = null;
        }
        if (video) video.srcObject = null;
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        inAppCamera.isRecordingVideo = false;
    }

    function capturePhoto() {
        const video = document.getElementById('camera-preview');
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(function(blob) {
            if (!blob) return;
            const file = new File([blob], 'camera_' + Date.now() + '.jpg', { type: 'image/jpeg' });
            closeInAppCamera();
            const previewUrl = URL.createObjectURL(blob);
            pendingFiles.push({ file, previewUrl, type: 'image' });
            renderPreviewBar();
            updateSendButtonVisibility();
            setTimeout(() => {
                const input = document.getElementById('chat-input');
                if (input) input.focus();
            }, 200);
        }, 'image/jpeg', 0.9);
    }

    function startVideoRecording() {
        const stream = inAppCamera.stream;
        if (!stream) return;
        let mimeType = '';
        const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
        for (const t of candidates) {
            if (MediaRecorder.isTypeSupported(t)) { mimeType = t; break; }
        }
        try {
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
            inAppCamera.mediaRecorder = recorder;
            inAppCamera.recordedChunks = [];

            recorder.addEventListener('dataavailable', function(e) {
                if (e.data.size > 0) inAppCamera.recordedChunks.push(e.data);
            });
            recorder.addEventListener('stop', function() {
                const blobType = recorder.mimeType || 'video/webm';
                const blob = new Blob(inAppCamera.recordedChunks, { type: blobType });
                inAppCamera.recordedChunks = [];
                const ext = blobType.includes('mp4') ? 'mp4' : 'webm';
                const file = new File([blob], 'video_' + Date.now() + '.' + ext, { type: blobType });
                closeInAppCamera();
                const previewUrl = URL.createObjectURL(blob);
                pendingFiles.push({ file, previewUrl, type: 'video' });
                renderPreviewBar();
                updateSendButtonVisibility();
                setTimeout(() => {
                    const input = document.getElementById('chat-input');
                    if (input) input.focus();
                }, 200);
            });

            recorder.start();
            inAppCamera.isRecordingVideo = true;
            inAppCamera.recordStartTime = Date.now();

            const shutter = document.getElementById('camera-shutter');
            if (shutter) shutter.classList.add('recording');
            const timerEl = document.getElementById('camera-timer');
            const timerText = document.getElementById('camera-timer-text');
            if (timerEl) timerEl.classList.add('visible');

            inAppCamera.timerInterval = setInterval(() => {
                const secs = Math.floor((Date.now() - inAppCamera.recordStartTime) / 1000);
                const m = Math.floor(secs / 60);
                const s = secs % 60;
                if (timerText) timerText.textContent = m + ':' + (s < 10 ? '0' : '') + s;
            }, 200);
        } catch (err) {
            console.error('MediaRecorder error:', err);
            showToast('Gagal merekam video', 'error');
        }
    }

    function stopVideoRecording() {
        if (inAppCamera.mediaRecorder && inAppCamera.isRecordingVideo) {
            try { inAppCamera.mediaRecorder.stop(); } catch(e) {}
            inAppCamera.isRecordingVideo = false;
        }
    }

    function setupCameraEvents() {
        const overlay = document.getElementById('camera-overlay');
        const closeBtn = document.getElementById('camera-close-btn');
        const flipBtn = document.getElementById('camera-flip-btn');
        const shutter = document.getElementById('camera-shutter');
        if (!overlay) return;

        if (closeBtn) closeBtn.addEventListener('click', closeInAppCamera);

        if (flipBtn) {
            flipBtn.addEventListener('click', function() {
                inAppCamera.facingMode = inAppCamera.facingMode === 'environment' ? 'user' : 'environment';
                if (inAppCamera.stream) {
                    inAppCamera.stream.getTracks().forEach(t => t.stop());
                }
                navigator.mediaDevices.getUserMedia({
                    video: { facingMode: inAppCamera.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: true
                }).then(stream => {
                    inAppCamera.stream = stream;
                    const video = document.getElementById('camera-preview');
                    if (video) { video.srcObject = stream; video.play().catch(() => {}); }
                }).catch(() => showToast('Gagal balik kamera', 'error'));
            });
        }

        document.querySelectorAll('.camera-mode-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                if (inAppCamera.isRecordingVideo) {
                    showToast('Stop rekaman dulu', 'warning');
                    return;
                }
                document.querySelectorAll('.camera-mode-btn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                inAppCamera.mode = this.dataset.mode;
            });
        });

        if (shutter) {
            shutter.addEventListener('click', function() {
                if (inAppCamera.mode === 'photo') capturePhoto();
                else {
                    if (inAppCamera.isRecordingVideo) stopVideoRecording();
                    else startVideoRecording();
                }
            });
        }
    }

    /* ============================================================
       LIGHTBOX
    ============================================================ */
    function openLightbox(url, type, fileName) {
        const overlay = document.getElementById('lightbox-overlay');
        const content = document.getElementById('lightbox-content');
        if (!overlay || !content) return;
        if (!isValidHttpUrl(url)) return;

        content.innerHTML = '';

        if (type === 'image') {
            const img = document.createElement('img');
            img.src = url;
            img.alt = fileName || 'Gambar';
            img.style.touchAction = 'pinch-zoom';
            img.addEventListener('click', function(e) {
                e.stopPropagation();
                closeLightbox();
            });
            content.appendChild(img);
        } else if (type === 'video') {
            const video = document.createElement('video');
            video.src = url;
            video.controls = true;
            video.playsInline = true;
            video.setAttribute('playsinline', '');
            content.appendChild(video);
        }

        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        const overlay = document.getElementById('lightbox-overlay');
        const content = document.getElementById('lightbox-content');
        if (!overlay || !content) return;
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        const video = content.querySelector('video');
        if (video) {
            try { video.pause(); } catch(e) {}
            video.removeAttribute('src');
            try { video.load(); } catch(e) {}
        }
        setTimeout(() => {
            if (!overlay.classList.contains('active')) content.innerHTML = '';
        }, 300);
    }

    function setupLightboxEvents() {
        const overlay = document.getElementById('lightbox-overlay');
        const closeBtn = document.getElementById('lightbox-close');
        if (!overlay) return;
        function handleClose(e) {
            e.preventDefault();
            e.stopPropagation();
            closeLightbox();
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', handleClose);
            closeBtn.addEventListener('touchend', function(e) {
                e.preventDefault();
                handleClose(e);
            }, { passive: false });
        }
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeLightbox();
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && overlay.classList.contains('active')) closeLightbox();
        });
    }

    /* ============================================================
       PROFILE SETUP (username + avatar)
    ============================================================ */
    function normalizeUsername(val) {
        return val.replace(/^\s+|\s+$/g, '').replace(/\s+/g, ' ');
    }
    function isValidUsername(val) {
        if (!val || val.length === 0) return { valid: false, msg: 'Username tidak boleh kosong' };
        if (val.length < 3) return { valid: false, msg: 'Minimal 3 karakter' };
        if (val.length > 10) return { valid: false, msg: 'Maksimal 10 karakter' };
        if (!/^[a-zA-Z0-9 ]+$/.test(val)) return { valid: false, msg: 'Hanya huruf, angka, dan spasi' };
        if (/\s{2,}/.test(val)) return { valid: false, msg: 'Tidak boleh 2 spasi berturut-turut' };
        if (/^\s|\s$/.test(val)) return { valid: false, msg: 'Tidak boleh diawali/diakhiri spasi' };
        return { valid: true };
    }
    function resetUsernameHint(hintEl) {
        if (!hintEl) return;
        hintEl.textContent = 'Huruf besar/kecil, angka, spasi · 3-10 karakter';
        hintEl.style.color = '';
    }

    function setupProfileSetup() {
    const newUsernameInput = document.getElementById('new-username');
    const btnCreateProfile = document.getElementById('btn-create-profile');
    const avatarInput = document.getElementById('avatar-input');
    const avatarPreview = document.getElementById('avatar-preview');
    const avatarError = document.getElementById('avatar-error');

    if (newUsernameInput) {
        newUsernameInput.addEventListener('input', async function() {
            const raw = this.value;
            const normalized = normalizeUsername(raw);
            if (raw !== normalized && raw.length > 0 && !/\s$/.test(raw)) {
                this.value = normalized;
            }
            const val = this.value;
            const errorEl = document.getElementById('username-error');
            const hintEl = document.getElementById('username-hint');
            const checkIcon = document.getElementById('username-check-icon');
            const counter = document.getElementById('username-counter');

            const len = val.length;
            if (counter) {
                counter.textContent = len + '/10';
                counter.className = 'username-counter';
                if (len === 10) counter.classList.add('full');
                else if (len >= 8) counter.classList.add('warn');
            }

            if (checkIcon) {
                checkIcon.className = 'username-status-icon';
                checkIcon.innerHTML = '';
            }
            if (errorEl) errorEl.classList.remove('visible');
            resetUsernameHint(hintEl);

            if (!val) return;

            const result = isValidUsername(val);
            if (!result.valid) {
                if (errorEl) { errorEl.textContent = result.msg; errorEl.classList.add('visible'); }
                if (checkIcon) {
                    checkIcon.classList.add('taken');
                    checkIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
                }
                return;
            }
            if (checkIcon) checkIcon.innerHTML = '<div class="mini-spinner"></div>';

            clearTimeout(this._timeout);
            const currentVal = val;
            this._timeout = setTimeout(async () => {
                if (newUsernameInput.value !== currentVal) return;
                try {
                    const exists = await checkUsername(currentVal);
                    if (newUsernameInput.value !== currentVal) return;
                    if (exists) {
                        if (errorEl) {
                            errorEl.textContent = 'Username sudah dipakai (huruf besar/kecil dianggap sama)';
                            errorEl.classList.add('visible');
                        }
                        if (checkIcon) {
                            checkIcon.className = 'username-status-icon taken';
                            checkIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
                        }
                        if (counter) counter.classList.add('full');
                        resetUsernameHint(hintEl);
                    } else {
                        if (errorEl) errorEl.classList.remove('visible');
                        if (checkIcon) {
                            checkIcon.className = 'username-status-icon available';
                            checkIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
                        }
                        if (hintEl) {
                            hintEl.textContent = 'Username tersedia!';
                            hintEl.style.color = 'var(--success)';
                        }
                        if (counter) counter.classList.add('available');
                    }
                } catch (e) {
                    if (checkIcon) checkIcon.innerHTML = '';
                }
            }, 150);
        });
    }

    if (avatarInput) {
        avatarInput.addEventListener('change', async function() {
            const file = this.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) {
                if (avatarError) {
                    avatarError.textContent = 'Ukuran file maksimal 2MB';
                    avatarError.classList.add('visible');
                }
                this.value = '';
                return;
            }
            if (!file.type.startsWith('image/')) {
                if (avatarError) {
                    avatarError.textContent = 'Hanya file gambar yang didukung';
                    avatarError.classList.add('visible');
                }
                this.value = '';
                return;
            }
            if (avatarError) avatarError.classList.remove('visible');
            uploadedAvatarUrl = '';

            const reader = new FileReader();
            reader.onload = function(e) {
                if (avatarPreview) {
                    avatarPreview.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
                }
            };
            reader.readAsDataURL(file);

            // ✅ FIX #2: simpan Promise ke _pendingAvatarUploadPromise
            _pendingAvatarUploadPromise = uploadAvatarToCloudinary(file, getMyUid() || 'anon')
                .then(url => { uploadedAvatarUrl = url; })
                .catch(err => {
                    if (avatarError) {
                        avatarError.textContent = 'Gagal upload: ' + err.message;
                        avatarError.classList.add('visible');
                    }
                    if (avatarPreview) avatarPreview.innerHTML = '<i class="fa-solid fa-user"></i>';
                    uploadedAvatarUrl = '';
                });
        });   // ✅ FIX #1: tutup change handler DI SINI
    }         // ✅ FIX #1: tutup if (avatarInput) DI SINI

    // ✅ FIX #1: btnCreateProfile handler SEKARANG DI LUAR change handler
    if (btnCreateProfile) {
        btnCreateProfile.addEventListener('click', async function() {
            // Kalau upload masih jalan — tunggu otomatis, tampilkan spinner
            if (_pendingAvatarUploadPromise) {
                btnCreateProfile.disabled = true;
                btnCreateProfile.style.pointerEvents = 'none';
                btnCreateProfile.innerHTML = '<span class="gate-spinner" style="width:18px;height:18px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Memproses...';

                await _pendingAvatarUploadPromise;
                _pendingAvatarUploadPromise = null;

                btnCreateProfile.disabled = false;
                btnCreateProfile.style.pointerEvents = '';
                btnCreateProfile.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Bergabung ke Grup';

                if (avatarInput && avatarInput.files[0] && !uploadedAvatarUrl) return; // upload gagal
            }

            const rawUsername = newUsernameInput.value;
            const username = normalizeUsername(rawUsername);
            const errorEl = document.getElementById('username-error');
            const validation = isValidUsername(username);
            if (!validation.valid) {
                if (errorEl) { errorEl.textContent = validation.msg; errorEl.classList.add('visible'); }
                return;
            }

            if (avatarInput && avatarInput.files[0] && !uploadedAvatarUrl) {
                if (avatarError) {
                    avatarError.textContent = 'Foto masih diupload atau gagal. Coba pilih lagi.';
                    avatarError.classList.add('visible');
                }
                showToast('Tunggu upload foto selesai dulu', 'warning');
                return;
            }

            btnCreateProfile.disabled = true;
            btnCreateProfile.innerHTML = '<span class="gate-spinner" style="width:18px;height:18px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;display:inline-block;"></span> Memproses...';
            if (errorEl) errorEl.classList.remove('visible');

            try {
                const exists = await checkUsername(username);
                if (exists) {
                    if (errorEl) {
                        errorEl.textContent = 'Username sudah dipakai, coba yang lain';
                        errorEl.classList.add('visible');
                    }
                    return;
                }
                const uid = getMyUid();
                const avatarUrl = uploadedAvatarUrl || '';
                const success = await createProfile(uid, username, avatarUrl);
                if (success) {
                    currentUser = { uid, username, avatar: avatarUrl };
                    setStoredUser(currentUser);
                    showToast('Selamat datang di grup! 🎉', 'success');
                    initChat();
                } else {
                    if (errorEl) {
                        errorEl.textContent = 'Gagal membuat profil, coba lagi';
                        errorEl.classList.add('visible');
                    }
                }
            } catch (err) {
                console.error('Error saat membuat profil:', err);
                if (errorEl) {
                    errorEl.textContent = 'Terjadi error: ' + err.message;
                    errorEl.classList.add('visible');
                }
            } finally {
                btnCreateProfile.disabled = false;
                btnCreateProfile.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Bergabung ke Grup';
            }
        });
    }
}

    /* ============================================================
       EDIT PROFILE MODAL
    ============================================================ */
    function setupEditProfile() {
        const btnOpenSettings = document.getElementById('btn-open-settings');
        const editAvatarClickable = document.getElementById('edit-avatar-clickable');
        const editAvatarInput = document.getElementById('edit-avatar-input');
        const editAvatarPreview = document.getElementById('edit-avatar-preview');
        const editAvatarError = document.getElementById('edit-avatar-error');
        const editUsernameInput = document.getElementById('edit-username-input');

        if (editUsernameInput) {
            editUsernameInput.addEventListener('input', function() {
                const raw = this.value;
                const normalized = normalizeUsername(raw);
                if (raw !== normalized && raw.length > 0 && !/\s$/.test(raw)) {
                    this.value = normalized;
                }
                const errEl = document.getElementById('edit-username-error');
                if (errEl) errEl.classList.remove('visible');
            });
        }

        if (btnOpenSettings) {
            btnOpenSettings.addEventListener('click', function() {
                if (!currentUser) return;
                const modal = document.getElementById('edit-profile-modal');
                const input = document.getElementById('edit-username-input');
                const errorEl = document.getElementById('edit-username-error');
                const avatarPreview = document.getElementById('edit-avatar-preview');
                const avatarError = document.getElementById('edit-avatar-error');

                if (input) input.value = currentUser.username;
                if (errorEl) errorEl.classList.remove('visible');
                if (avatarError) avatarError.classList.remove('visible');

                window._avatarUploadState.edit = false;
                newAvatarUrl = null;
                const saveBtnReset = document.getElementById('edit-profile-save');
                if (saveBtnReset) {
                    saveBtnReset.disabled = false;
                    saveBtnReset.style.pointerEvents = '';
                    saveBtnReset.style.opacity = '';
                    saveBtnReset.innerHTML = 'Simpan Perubahan';
                }
                if (input) input.disabled = false;

                if (currentUser.avatar) {
                    const cleanUrl = safeImageUrl(currentUser.avatar).split('?')[0];
                    if (avatarPreview) {
                        avatarPreview.innerHTML = '<img src="' + cleanUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
                    }
                } else if (avatarPreview) {
                    avatarPreview.innerHTML = '<i class="fa-solid fa-user"></i>';
                }

                if (editAvatarInput) editAvatarInput.value = '';
                modal.classList.add('active');
                document.body.classList.add('modal-open');
                setTimeout(() => input && input.focus(), 100);
            });
        }

        if (editAvatarClickable && editAvatarInput) {
            editAvatarClickable.addEventListener('click', function() { editAvatarInput.click(); });
            editAvatarClickable.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    editAvatarInput.click();
                }
            });
        }

        if (editAvatarInput) {
            editAvatarInput.addEventListener('change', async function() {
                const file = this.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                    if (editAvatarError) { editAvatarError.textContent = 'Ukuran file maksimal 2MB'; editAvatarError.classList.add('visible'); }
                    this.value = '';
                    return;
                }
                if (!file.type.startsWith('image/')) {
                    if (editAvatarError) { editAvatarError.textContent = 'Hanya file gambar yang didukung'; editAvatarError.classList.add('visible'); }
                    this.value = '';
                    return;
                }
                if (editAvatarError) editAvatarError.classList.remove('visible');
                newAvatarUrl = null;

                const reader = new FileReader();
                reader.onload = function(e) {
                    if (editAvatarPreview) {
                        editAvatarPreview.innerHTML = '<img src="' + e.target.result + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
                    }
                };
                reader.readAsDataURL(file);

                _pendingAvatarUploadPromise = uploadAvatarToCloudinary(file, currentUser?.uid || getMyUid())
    .then(url => { newAvatarUrl = url; })
    .catch(err => {
        if (editAvatarError) { editAvatarError.textContent = 'Gagal upload: ' + err.message; editAvatarError.classList.add('visible'); }
        if (editAvatarPreview) editAvatarPreview.innerHTML = '<i class="fa-solid fa-user"></i>';
        newAvatarUrl = null;
    });
            });
        }

        const editProfileCancel = document.getElementById('edit-profile-cancel');
        if (editProfileCancel) {
            editProfileCancel.addEventListener('click', function() {
                if (window._avatarUploadState.edit) {
                    showToast('Tunggu upload foto selesai...', 'warning');
                    return;
                }
                document.getElementById('edit-profile-modal').classList.remove('active');
                document.body.classList.remove('modal-open');
                window._avatarUploadState.edit = false;
                newAvatarUrl = null;
                const editAvatarInputEl = document.getElementById('edit-avatar-input');
                if (editAvatarInputEl) editAvatarInputEl.value = '';
            });
        }

        const editProfileSave = document.getElementById('edit-profile-save');
        if (editProfileSave) {
            editProfileSave.addEventListener('click', async function() {
    if (_pendingAvatarUploadPromise) {
        editProfileSave.disabled = true;
        editProfileSave.style.pointerEvents = 'none';
        editProfileSave.innerHTML = '<span class="gate-spinner" style="width:16px;height:16px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Memproses...';

        await _pendingAvatarUploadPromise;
        _pendingAvatarUploadPromise = null;

        editProfileSave.disabled = false;
        editProfileSave.style.pointerEvents = '';
        editProfileSave.innerHTML = 'Simpan Perubahan';

        if (!newAvatarUrl && editAvatarInput && editAvatarInput.files[0]) return; // upload gagal
    }

    const input = document.getElementById('edit-username-input');
    // ... sisanya biarkan apa adanya
                const errorEl = document.getElementById('edit-username-error');
                const newUsername = input.value.trim();

                const usernameChanged = newUsername && newUsername !== currentUser.username;
                const avatarChanged = !!newAvatarUrl;

                if (!usernameChanged && !avatarChanged) {
                    document.getElementById('edit-profile-modal').classList.remove('active');
                    document.body.classList.remove('modal-open');
                    return;
                }

                let normalizedNewUsername = newUsername;
                if (usernameChanged) {
                    normalizedNewUsername = normalizeUsername(newUsername);
                    const validation = isValidUsername(normalizedNewUsername);
                    if (!validation.valid) {
                        if (errorEl) { errorEl.textContent = validation.msg; errorEl.classList.add('visible'); }
                        return;
                    }
                    const exists = await checkUsername(normalizedNewUsername);
                    if (exists) {
                        if (errorEl) {
                            errorEl.textContent = 'Username sudah dipakai (huruf besar/kecil dianggap sama)';
                            errorEl.classList.add('visible');
                        }
                        return;
                    }
                }

                const saveBtn = document.getElementById('edit-profile-save');
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<span class="gate-spinner" style="width:16px;height:16px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;display:inline-block;"></span> Menyimpan...';
                }

                let success = true;

                if (usernameChanged) {
                    const result = await updateUsername(currentUser.uid, normalizedNewUsername);
                    if (!result.success) {
                        success = false;
                        if (errorEl) { errorEl.textContent = result.error; errorEl.classList.add('visible'); }
                    } else {
                        currentUser.username = normalizedNewUsername;
                    }
                }

                if (avatarChanged && success) {
                    const result = await updateAvatar(currentUser.uid, newAvatarUrl);
                    if (!result.success) {
                        success = false;
                        if (editAvatarError) { editAvatarError.textContent = result.error; editAvatarError.classList.add('visible'); }
                        showToast(result.error, 'error');
                    } else {
                        currentUser.avatar = newAvatarUrl;
                        const nowMs = Date.now();
                        window._userAvatarCache[currentUser.uid] = {
                            username: currentUser.username,
                            avatar: newAvatarUrl,
                            avatarUpdatedAt: { toMillis: () => nowMs },
                            avatarUpdatedAtMs: nowMs
                        };
                    }
                }

                if (success) {
                    setStoredUser(currentUser);
                    const nameEl = document.getElementById('my-username-display');
                    if (nameEl) nameEl.textContent = currentUser.username;
                    showToast('Profil berhasil diupdate!', 'success');
                    document.getElementById('edit-profile-modal').classList.remove('active');
                    document.body.classList.remove('modal-open');
                    newAvatarUrl = null;
                    const editAvatarInputEl = document.getElementById('edit-avatar-input');
                    if (editAvatarInputEl) editAvatarInputEl.value = '';
                }

                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = 'Simpan Perubahan';
                }
            });
        }
    }
/* ============================================================
   EMOJI PICKER
============================================================ */
const EMOJI_LIST = [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃',
    '😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜',
    '🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟',
    '😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡',
    '🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔',
    '🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮',
    '😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷',
    '🤒','🤕','👍','👎','👌','✌️','🤞','🤟','🤘','🤙','👈','👉',
    '👆','👇','☝️','✋','🤚','🖐','🖖','👋','🤝','🙏','✍️','💪',
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕',
    '💞','💓','💗','💖','💘','💝','💟','🔥','✨','⭐','🌟','💫',
    '💥','💢','💤','💦','💨','🕳','💬','💭','🎉','🎊','🎈','🎁',
    '🎀','🎂','🍰','🧁','🍪','🍩','🍫','🍬','🍭','☕','🍕','🍔'
];
function setupEmojiPicker() {
    const btn = document.getElementById('btn-emoji');
    const picker = document.getElementById('emoji-picker');
    const grid = document.getElementById('emoji-grid');
    const input = document.getElementById('chat-input');

    if (!btn || !picker || !grid || !input) {
        console.warn('[Emoji] Element tidak ditemukan');
        return;
    }

    // Bikin grid emoji sekali
    if (grid.children.length === 0) {
        EMOJI_LIST.forEach(em => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'emoji-btn';
            b.textContent = em;
            b.addEventListener('click', function(e) {
                e.preventDefault();
                insertEmojiIntoInput(em, input);
            });
            grid.appendChild(b);
        });
    }

    // Toggle picker: klik emoji → hide keyboard + show picker
    btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        const isVisible = picker.classList.contains('visible');

        if (isVisible) {
            // Tutup picker → buka keyboard
            picker.classList.remove('visible');
            input.focus();
        } else {
            // Tutup keyboard → buka picker
            input.blur();
            // Delay dikit biar animasi keyboard selesai
            setTimeout(() => {
                picker.classList.add('visible');
                scrollToBottom(false);
            }, 100);
        }
    });

    // Klik input field → tutup picker, buka keyboard
    input.addEventListener('focus', function() {
        picker.classList.remove('visible');
    });

    // Tutup picker saat kirim pesan
    const btnSend = document.getElementById('btn-send');
    if (btnSend) {
        btnSend.addEventListener('click', () => picker.classList.remove('visible'));
    }
}


function insertEmojiIntoInput(emoji, input) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.substring(0, start);
    const after = input.value.substring(end);
    input.value = before + emoji + after;
    const newPos = start + emoji.length;
    input.setSelectionRange(newPos, newPos);
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
    function setupKeyboardDocking() {
    const vv = window.visualViewport;
    const chatCard = document.getElementById('chat-card');
    const chatInput = document.getElementById('chat-input');
    const messagesList = document.getElementById('messages-list');
    if (!chatCard || !chatInput) return;

    const HEADER_H = 64; // tinggi #top-header (--header-h: 64px)
    let baseVH = vv ? vv.height : window.innerHeight;

    function scrollBottom() {
        if (messagesList) messagesList.scrollTop = messagesList.scrollHeight;
    }

    function apply() {
        if (!vv) {
            chatInput.addEventListener('focus', () => {
                document.body.classList.add('keyboard-open');
                chatCard.classList.add('keyboard-open');
            });
            chatInput.addEventListener('blur', () => {
                document.body.classList.remove('keyboard-open');
                chatCard.classList.remove('keyboard-open');
            });
            return;
        }

        const vvH = vv.height;
        const vvTop = vv.offsetTop;
        const keyboardHeight = baseVH - vvH;
        const open = keyboardHeight > 80;

        chatCard.classList.toggle('keyboard-open', open);
        document.body.classList.toggle('keyboard-open', open);

        if (open) {
            const cardTop = vvTop + HEADER_H;
            const cardHeight = vvH - HEADER_H;

            // ✅ KUNCI FIX: pakai cssText dengan !important
            //    biar MENANG lawan .chat-card-fullscreen.keyboard-open
            //    dan body.chat-open .chat-card-fullscreen { height: auto !important }
            chatCard.style.cssText = [
                'position: fixed',
                'top: ' + cardTop + 'px',
                'left: 0',
                'right: 0',
                'bottom: auto',
                'width: 100vw',
                'height: ' + Math.max(cardHeight, 200) + 'px',
                'max-height: none',
                'min-height: 0',
                'margin: 0',
                'padding: 0',
                'border-radius: 0',
                'border: none',
                'z-index: 9999',
                'overflow: hidden',
                'background: var(--bg-card)',
                'display: flex',
                'flex-direction: column'
            ].join(' !important; ') + ' !important;';

            // Scroll ke bawah berkali-kali — keyboard animasi lambat di Android
            requestAnimationFrame(scrollBottom);
            setTimeout(scrollBottom, 100);
            setTimeout(scrollBottom, 300);

        } else {
            chatCard.style.cssText = '';
            baseVH = vvH;
        }
    }

    if (vv) {
        vv.addEventListener('resize', apply);
        vv.addEventListener('scroll', apply);
    }

    // Trigger berkali-kali saat fokus — Android kadang lambat fire resize
    chatInput.addEventListener('focus', function () {
        if (vv) baseVH = Math.max(baseVH, vv.height);
        [50, 150, 300, 500, 700].forEach(t => setTimeout(apply, t));
    });

    chatInput.addEventListener('blur', function () {
        setTimeout(apply, 180);
    });

    apply();
}
    /* ============================================================
       INIT CHAT
    ============================================================ */
    function initChat() {
        const profileSetup = document.getElementById('profile-setup');
        const chatContainer = document.getElementById('chat-container');
        if (profileSetup) profileSetup.style.display = 'none';
        if (chatContainer) {
            chatContainer.style.display = 'flex';
            chatContainer.style.flexDirection = 'column';
            chatContainer.style.gap = '12px';
        }

        document.documentElement.classList.add('chat-open');
        document.body.classList.add('chat-open');

        const myUsernameDisplay = document.getElementById('my-username-display');
        if (myUsernameDisplay) myUsernameDisplay.textContent = currentUser.username;

        updateOnlineStatus(true);
        subscribeMessages();
        subscribeUsers();
        subscribeTyping();
initUnreadListener();
        if (statusInterval) clearInterval(statusInterval);
        statusInterval = setInterval(() => {
            if (currentUser) updateOnlineStatus(true);
        }, 30000);

        if (!window._groupVisHandler) {
            window._groupVisHandler = true;
            document.addEventListener('visibilitychange', function () {
                if (!currentUser) return;
                updateOnlineStatus(!document.hidden);
            });
            window.addEventListener('beforeunload', function () {
                if (!currentUser) return;
                const payload = JSON.stringify({ uid: currentUser.uid, isOnline: false });
                if (navigator.sendBeacon) {
                    navigator.sendBeacon('/api/update-status', new Blob([payload], { type: 'application/json' }));
                }
            });
        }

        setTimeout(() => scrollToBottom(false), 300);
        // Tandai chat sudah dibaca
setTimeout(() => markChatAsRead(), 500);
    }

    /* ============================================================
       CHECK USER (bootstrap)
    ============================================================ */
    async function checkUser() {
    console.log('[Chat] checkUser() dipanggil');
    const db = getDb();
    if (!db) {
        console.error('[Chat] DB belum siap di checkUser');
        showProfileSetup();
        return;
    }

    const uid = getMyUid();
    console.log('[Chat] checkUser — uid:', uid);

    if (!uid) {
        console.error('[Chat] UID belum siap, tunggu 1 detik...');
        setTimeout(checkUser, 1000);
        return;
    }

    let userDoc;
    try {
        userDoc = await db.collection('users').doc(uid).get();
        console.log('[Chat] User doc exists:', userDoc.exists);
    } catch (e) {
        console.error('[Chat] checkUser Firestore error:', e.code, e.message);
        // Kalau error permission → tampilin profil setup biar user bisa daftar
        showProfileSetup();
        return;
    }

    if (userDoc.exists) {
        const data = userDoc.data();
        console.log('[Chat] User found:', data.username);
        currentUser = {
            uid: uid,
            username: data.username,
            avatar: data.avatar || ''
        };
        setStoredUser(currentUser);
        initChat();
    } else {
        console.log('[Chat] User belum ada profil → tampil form setup');
        showProfileSetup();
    }
}

function showProfileSetup() {
    const profileSetup = document.getElementById('profile-setup');
    const chatContainer = document.getElementById('chat-container');
    if (profileSetup) profileSetup.style.display = 'block';
    if (chatContainer) chatContainer.style.display = 'none';
    document.documentElement.classList.remove('chat-open');
    document.body.classList.remove('chat-open');

    if (messagesUnsubscribe) { try { messagesUnsubscribe(); } catch(e) {} messagesUnsubscribe = null; }
    if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }

    subscribeUsers();
}

    /* ============================================================
       BOOTSTRAP CHAT MODULE
    ============================================================ */
    function bootstrap() {
        // Setup event listeners dulu (biar bisa dipakai walau user belum login)
        setupProfileSetup();
        setupEditProfile();
        setupSendButton();
        setupFileInputs();
        setupAttachMenu();
        setupVoiceNote();
        setupCameraEvents();
        setupLightboxEvents();
        setupChatSearchEvents();
        setupMemberPanelEvents();
        setupScrollListener();
        setupSwipeToReply();
        setupEditMessageEvents();

       // Setup keyboard docking juga
setupKeyboardDocking();

// Setup emoji picker
setupEmojiPicker();

        // Init state tombol send
        updateSendButtonVisibility();
        // Tunggu DB + Auth siap
let _checkUserAttempts = 0;
const tryCheckUser = () => {
    _checkUserAttempts++;
    const dbReady = !!window._db;
    const uidReady = !!window.CURRENT_USER_ID;

    if (dbReady && uidReady) {
        console.log('[Chat] Bootstrap OK — db & uid ready, uid=' + window.CURRENT_USER_ID);
        checkUser();
    } else if (_checkUserAttempts > 75) {  // max 30 detik
        console.error('[Chat] Bootstrap TIMEOUT — db=' + dbReady + ' uid=' + uidReady);
        console.error('[Chat] Cek: Firebase Auth Anonymous enabled? Refresh halaman?');
        // Paksa panggil walau gak siap, biar gak blank
        checkUser();
    } else {
        if (_checkUserAttempts % 5 === 0) {
            console.log('[Chat] Waiting for auth... attempt ' + _checkUserAttempts + ' (db=' + dbReady + ', uid=' + uidReady + ')');
        }
        setTimeout(tryCheckUser, 400);
    }
};
tryCheckUser();
// FALLBACK: kalau dalam 5 detik belum ada keputusan, tampilkan form setup
setTimeout(() => {
    const profileSetup = document.getElementById('profile-setup');
    const chatContainer = document.getElementById('chat-container');
    const setupVisible = profileSetup && profileSetup.style.display === 'block';
    const chatVisible = chatContainer && chatContainer.style.display !== 'none';
    if (!setupVisible && !chatVisible) {
        console.warn('[Chat] Fallback timeout — tampilkan form setup paksa');
        if (profileSetup) profileSetup.style.display = 'block';
    }
}, 5000);
}
    // Wait DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }

    window.EkkChat = {
initChat,
checkUser,
deleteMessageAsAdmin,
    openMemberPanel,
    closeMemberPanel,
    openChatSearch,
    closeChatSearch,
    scrollToBottom,
    markRead: markChatAsRead,
    stopTyping: clearTyping,
    get currentUser() { return currentUser; }
};
})();
