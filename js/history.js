/* ============================================================
   EKK STORE 4.0 — HISTORY.JS
   Berisi: renderHistory, setupHistoryEvents, deleteHistoryItem
   Digunakan HANYA di /history (history/index.html)

   Catatan:
   - Tampil FLAT (bukan dipisah section)
   - Limit 20 per status (20 success + 20 failed + 20 proses)
   - Header "N Deploy Terakhir"
   - Contoh: 15 success + 10 failed → tampil 25, header "25 Deploy Terakhir"
   ============================================================ */

/* ============================================================
   1) RENDER HISTORY LIST
   ============================================================ */
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

    const isFiltering = historyFilter !== 'all' || historySearch.trim();

    /* ---- Mode FILTER / SEARCH → tampil flat biasa ---- */
    if (isFiltering) {
        if (filtered.length === 0) {
            historyList.innerHTML =
                '<div class="empty-state">' +
                    '<i class="fa-solid fa-inbox"></i>' +
                    '<p>Tidak ada hasil</p>' +
                    '<span class="sub">Coba kata kunci lain</span>' +
                '</div>';
            return;
        }
        historyList.innerHTML = filtered.map(item => renderHistoryRow(item, history)).join('');
        return;
    }

    /* ---- Mode DEFAULT → limit 20 per status, tampil flat ---- */
    const successItems = filtered.filter(i => i.status === 'success').slice(0, 20);
    const failedItems  = filtered.filter(i => i.status === 'failed').slice(0, 20);
    const prosesItems  = filtered.filter(i => i.status === 'proses').slice(0, 20);

    const combined = [...successItems, ...failedItems, ...prosesItems]
        .sort((a, b) => b._ts - a._ts);

    if (combined.length === 0) {
        historyList.innerHTML =
            '<div class="empty-state">' +
                '<i class="fa-solid fa-inbox"></i>' +
                '<p>Belum ada deployment</p>' +
                '<span class="sub">Deployment yang Anda lakukan akan muncul di sini</span>' +
                '<button class="btn btn-primary btn-sm" data-page="deploy" style="display:inline-flex;">' +
                    '<i class="fa-solid fa-rocket"></i> Mulai Deploy' +
                '</button>' +
            '</div>';
        historyList.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', function () {
                navigateTo(this.dataset.page);
            });
        });
        return;
    }

    /* ---- Header info total ---- */
    let html =
        '<div style="padding:10px 14px;margin-bottom:12px;background:var(--bg-input);border-radius:10px;border:1px solid var(--border);text-align:center;">' +
            '<span style="font-size:11px;font-weight:600;color:var(--text-muted);letter-spacing:.04em;">' +
                combined.length + ' Deploy Terakhir' +
            '</span>' +
        '</div>';

    /* ---- Flat list ---- */
    html += combined.map(item => renderHistoryRow(item, history)).join('');

    historyList.innerHTML = html;
}

/* ============================================================
   2) RENDER 1 BARIS HISTORY
   ============================================================ */
function renderHistoryRow(item, history) {
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
}

/* ============================================================
   3) HISTORY EVENTS (delegation, filter chips, search)
   ============================================================ */
function setupHistoryEvents() {
    const historyList = document.getElementById('history-list');
    if (historyList) {
        historyList.addEventListener('click', function (e) {
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
        searchInput.addEventListener('input', function () {
            historySearch = this.value;
            renderHistory();
        });
    }

    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', function () {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            historyFilter = this.dataset.filter;
            renderHistory();
        });
    });
}

/* ============================================================
   4) DELETE HISTORY ITEM
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
                body: JSON.stringify({
                    projectId: item.projectId,
                    ownerId: uid,
                    authUid: CURRENT_USER_ID || uid
                })
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
   5) EXPOSE GLOBAL
   ============================================================ */
window.deleteHistoryItem = deleteHistoryItem;

/* ============================================================
   6) PAGE-SPECIFIC INIT
   Dipanggil otomatis oleh common.js's initApp()
   ============================================================ */
function setupPageSpecific() {
    setupHistoryEvents();
    renderHistory();
}