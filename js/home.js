const STATS_CACHE_KEY = 'ekk_stats_cache_v1';

function updateDashboardStats() {
    const history = getHistory();
    const total = history.length;
    const success = history.filter(h => h.status === 'success').length;
    const failed = history.filter(h => h.status === 'failed').length;

    const totalEl = document.getElementById('stat-total');
    const successEl = document.getElementById('stat-success');
    const failedEl = document.getElementById('stat-failed');

    // Kalau data belum load (kosong) → coba pakai cache biar gak kedip 0
    if (total === 0) {
        try {
            const cached = localStorage.getItem(STATS_CACHE_KEY);
            if (cached) {
                const c = JSON.parse(cached);
                if (totalEl) totalEl.textContent = c.total ?? '—';
                if (successEl) successEl.textContent = c.success ?? '—';
                if (failedEl) failedEl.textContent = c.failed ?? '—';
            }
        } catch (e) {}
        // Skip render list dulu — biar ga render empty state yang salah
        return;
    }

    // Render dari data asli
    if (totalEl) totalEl.textContent = total;
    if (successEl) successEl.textContent = success;
    if (failedEl) failedEl.textContent = failed;

    // Simpan cache untuk next load
    try {
        localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({ total, success, failed }));
    } catch (e) {}

    // Recent deployments rendering
    const recentContainer = document.getElementById('recent-deployments');
    if (!recentContainer) return;

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

/* ============================================================
   INITIAL RENDER
   ============================================================ */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateDashboardStats);
} else {
    updateDashboardStats();
}