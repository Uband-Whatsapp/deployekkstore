/* ============================================================
   EKK STORE 4.0 — HOME.JS
   Berisi: Dashboard stats + recent deployments rendering
   Digunakan HANYA di index.html (Dashboard)
   ============================================================ */

/* ============================================================
   UPDATE DASHBOARD STATS + RECENT DEPLOYMENTS
   Dipanggil oleh:
   - common.js → startHistoryListener() setiap Firestore update
   - HOME.JS sendiri saat init (fallback)
   ============================================================ */
function updateDashboardStats() {
    const history = getHistory();
    const total = history.length;
    const success = history.filter(h => h.status === 'success').length;
    const failed = history.filter(h => h.status === 'failed').length;

    const totalEl = document.getElementById('stat-total');
    const successEl = document.getElementById('stat-success');
    const failedEl = document.getElementById('stat-failed');
    if (totalEl) totalEl.textContent = total;
    if (successEl) successEl.textContent = success;
    if (failedEl) failedEl.textContent = failed;

    const recentContainer = document.getElementById('recent-deployments');
    if (!recentContainer) return;

    if (total === 0) {
        recentContainer.innerHTML =
            '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Belum ada deployment</p><span class="sub">Project yang Anda deploy akan muncul di sini.</span><button class="btn btn-primary btn-sm" data-page="deploy" style="display:inline-flex;"><i class="fa-solid fa-rocket"></i> Mulai Deploy</button></div>';
        recentContainer.querySelectorAll('[data-page]').forEach(btn => {
            btn.addEventListener('click', function() {
                navigateTo(this.dataset.page);
            });
        });
    } else {
        const recent = history.slice(0, 5);
        recentContainer.innerHTML = recent.map(item => {
            let badge = '';
            if (item.status === 'success') {
                badge = '<span class="badge success"><i class="fa-solid fa-check-circle"></i> Berhasil</span>';
            } else if (item.status === 'failed') {
                badge = '<span class="badge failed"><i class="fa-solid fa-times-circle"></i> Gagal</span>';
            } else if (item.status === 'proses') {
                badge = '<span class="badge proses"><i class="fa-solid fa-spinner"></i> Proses</span>';
            }
            const urlSafe = isValidHttpUrl(item.url) ? item.url : '';
            return '<div class="history-item" style="margin-bottom:var(--space-2);">' +
                '<div class="history-info">' +
                '<span class="history-name" title="' + escapeAttr(item.project) + '">' + escapeHTML(item.project) + '</span>' +
                '<span class="history-meta"><i class="fa-regular fa-clock"></i> ' + escapeHTML(item.date) + ' · <span class="time-nowrap">' + escapeHTML(item.time) + '</span></span>' +
                (urlSafe ? '<a href="' + escapeAttr(urlSafe) + '" target="_blank" rel="noopener noreferrer" class="history-url" style="max-width:120px;">' + escapeHTML(urlSafe) + '</a>' : '') +
                '</div>' +
                '<div class="history-actions">' + badge + '</div>' +
                '</div>';
        }).join('');
    }
}

/* ============================================================
   INITIAL RENDER
   Panggil sekali saat home.js di-load, biar Dashboard langsung
   render (baik empty state atau data dari cache).
   Firestore listener dari common.js akan memanggil ulang function
   ini setiap ada update.
   ============================================================ */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateDashboardStats);
} else {
    updateDashboardStats();
}