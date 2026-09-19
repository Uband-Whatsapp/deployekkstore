/* ============================================================
   1) RENDER HISTORY LIST
   ============================================================ */
const HISTORY_CACHE_KEY = 'ekk_history_html_cache_v1';

function renderHistory() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    const history = getHistory();
    let filtered = [...history];

    if (historyFilter !== 'all') {
        filtered = filtered.filter(item => item.status === historyFilter);
    }
    if (historySearch.trim()) {
        const search = historySearch.toLowerCase().trim();
        filtered = filtered.filter(item => item.project.toLowerCase().includes(search));
    }

    // Kalau data kosong & tidak sedang filter/search → pakai cache
    if (history.length === 0 && historyFilter === 'all' && !historySearch.trim()) {
        try {
            const cached = localStorage.getItem(HISTORY_CACHE_KEY);
            if (cached) {
                historyList.innerHTML = cached;
                // Pasang event lagi
                historyList.querySelectorAll('[data-page]').forEach(btn => {
                    btn.addEventListener('click', function() {
                        navigateTo(this.dataset.page);
                    });
                });
                return;
            }
        } catch (e) {}
    }

    if (filtered.length === 0) {
        const emptyHtml = '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Belum ada deployment</p><span class="sub">Deployment yang Anda lakukan akan muncul di sini</span><button class="btn btn-primary btn-sm" data-page="deploy" style="display:inline-flex;"><i class="fa-solid fa-rocket"></i> Mulai Deploy</button></div>';
        historyList.innerHTML = emptyHtml;
        historyList.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', function() {
                navigateTo(this.dataset.page);
            });
        });
        return;
    }

    const html = filtered.map((item, index) => {
        const realIndex = history.indexOf(item);
        let statusBadge = '';
        if (item.status === 'success') {
            statusBadge = '<span class="badge success"><i class="fa-solid fa-check-circle"></i> Berhasil</span>';
        } else if (item.status === 'failed') {
            statusBadge = '<span class="badge failed"><i class="fa-solid fa-times-circle"></i> Gagal</span>';
        } else if (item.status === 'proses') {
            statusBadge = '<span class="badge proses"><i class="fa-solid fa-spinner"></i> Proses</span>';
        } else {
            statusBadge = '<span class="badge info">' + escapeHTML(item.status) + '</span>';
        }

        const urlSafe = isValidHttpUrl(item.url) ? item.url : '';
        const urlDisplay = urlSafe
            ? '<a href="' + escapeAttr(urlSafe) + '" target="_blank" rel="noopener noreferrer" class="history-url" title="' + escapeAttr(urlSafe) + '"><i class="fa-solid fa-link"></i> ' + escapeHTML(urlSafe) + '</a>'
            : '';

        return '<div class="history-item" data-index="' + realIndex + '">' +
            '<div class="history-info">' +
            '<span class="history-name" title="' + escapeAttr(item.project) + '">' + escapeHTML(item.project) + '</span>' +
            '<span class="history-meta"><i class="fa-regular fa-clock"></i> ' + escapeHTML(item.date) + ' · <span class="time-nowrap">' + escapeHTML(item.time) + '</span></span>' +
            (urlDisplay ? '<span class="history-meta">' + urlDisplay + '</span>' : '') +
            '</div>' +
            '<div class="history-actions">' +
            statusBadge +
            (urlSafe ? '<button class="history-action-btn" data-action="copy" data-url="' + escapeAttr(urlSafe) + '" title="Salin Link" aria-label="Salin Link"><i class="fa-solid fa-copy"></i></button>' : '') +
            (urlSafe ? '<a class="history-action-btn" href="' + escapeAttr(urlSafe) + '" target="_blank" rel="noopener noreferrer" title="Buka Website" aria-label="Buka Website"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>' : '') +
            '<button class="history-action-btn danger" data-action="delete" data-index="' + realIndex + '" title="Hapus" aria-label="Hapus"><i class="fa-solid fa-trash"></i></button>' +
            '</div>' +
            '</div>';
    }).join('');

    historyList.innerHTML = html;

    // Simpan cache (hanya kalau tidak sedang search/filter)
    if (historyFilter === 'all' && !historySearch.trim()) {
        try {
            localStorage.setItem(HISTORY_CACHE_KEY, html);
        } catch (e) {}
    }
}
/* ============================================================
   2) HISTORY EVENTS (delegation, filter chips, search)
   ============================================================ */
function setupHistoryEvents() {
    const historyList = document.getElementById('history-list');
    if (historyList) {
        historyList.addEventListener('click', function(e) {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'copy') {
                copyURL(btn.dataset.url);
            } else if (btn.dataset.action === 'delete') {
                deleteHistoryItem(parseInt(btn.dataset.index));
            }
        });
    }

    const searchInput = document.getElementById('history-search');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            historySearch = this.value;
            renderHistory();
        });
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            historyFilter = this.dataset.filter;
            renderHistory();
        });
    });
}

/* ============================================================
   3) DELETE HISTORY ITEM
   ============================================================ */
async function deleteHistoryItem(index) {
    const history = getHistory();
    if (index < 0 || index >= history.length) return;
    const item = history[index];
    const confirmed = await showConfirmModal(
        'Hapus Project?',
        'Project "' + item.project + '" akan dihapus dari Vercel dan database.\nWebsite akan mati.\n\nLanjutkan?',
        'Hapus'
    );
    if (!confirmed) return;

    const db = window._db;
    if (!db) return;
    const uid = getMyUid();

    if (item.projectId) {
        try {
            const response = await fetch('/api/delete-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: item.projectId, ownerId: uid })
            });
            const result = await response.json();
            if (!response.ok) {
                showToast('Gagal hapus Vercel: ' + (result.error || 'Error'), 'warning');
            } else {
                showToast('Project dihapus dari Vercel', 'success');
            }
        } catch (err) {
            console.error('[delete] Vercel error:', err);
            showToast('Gagal menghubungi server', 'warning');
        }
    }

    try {
        if (item.id) {
            await db.collection('projects').doc(item.id).delete();
            showToast('Project dihapus', 'success');
        }
    } catch (e) {
        console.error('[delete] Firestore error:', e);
        showToast('Gagal hapus dari database', 'error');
    }
}

/* ============================================================
   4) EXPOSE GLOBAL (untuk debug via console atau onclick)
   ============================================================ */
window.deleteHistoryItem = deleteHistoryItem;

/* ============================================================
   5) PAGE-SPECIFIC INIT
   Dipanggil otomatis oleh common.js's initApp()
   ============================================================ */
function setupPageSpecific() {
    setupHistoryEvents();
    // Render awal dengan cache kosong (akan diisi ulang oleh
    // startHistoryListener dari common.js begitu Firestore siap)
    renderHistory();
}