/* ============================================================
   1) PROJECT NAME VALIDATION
   ============================================================ */
function validateProjectName(name) {
    if (!name || name.length < 3) return { valid: false, msg: 'Nama project minimal 3 karakter.' };
    if (name.length > 52) return { valid: false, msg: 'Nama project maksimal 52 karakter.' };
    if (!/^[a-z0-9]/.test(name)) return { valid: false, msg: 'Diawali huruf kecil atau angka.' };
    if (!/[a-z0-9]$/.test(name)) return { valid: false, msg: 'Diakhiri huruf kecil atau angka.' };
    if (!/^[a-z0-9.-]+$/.test(name)) return { valid: false, msg: 'Hanya huruf kecil, angka, tanda hubung (-), dan titik (.).' };
    if (/--/.test(name)) return { valid: false, msg: 'Tidak boleh dua hubung berurutan (--).' };
    if (/\.\./.test(name)) return { valid: false, msg: 'Tidak boleh dua titik berurutan (..).' };
    return { valid: true };
}

/* ============================================================
   2) PROJECT INPUT
   ============================================================ */
function setupProjectInput() {
    const projectInput = document.getElementById('project');
    const projectHint = document.getElementById('project-hint');
    const projectError = document.getElementById('project-error');
    if (!projectInput) return;

    projectInput.addEventListener('input', function () {
        const val = this.value.trim().toLowerCase();
        this.value = val.replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^[-.]|[-.]$/g, '');

        if (this.value.length === 0) {
            this.classList.remove('error', 'success');
            if (projectError) projectError.classList.remove('visible');
            if (projectHint) projectHint.style.display = 'block';
            return;
        }
        const result = validateProjectName(this.value);
        if (result.valid) {
            this.classList.remove('error');
            this.classList.add('success');
            if (projectError) projectError.classList.remove('visible');
            if (projectHint) projectHint.style.display = 'block';
        } else {
            this.classList.remove('success');
            this.classList.add('error');
            if (projectError) {
                projectError.textContent = result.msg;
                projectError.classList.add('visible');
            }
            if (projectHint) projectHint.style.display = 'none';
        }
    });
}

/* ============================================================
   3) FILE UPLOAD
   ============================================================ */
let _selectedFile = null;

function setupFileUpload() {
    const uploadDropzone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('fileInput');
    const fileInfo = document.getElementById('file-info');
    if (!uploadDropzone || !fileInput || !fileInfo) return;

    uploadDropzone.addEventListener('click', function() { fileInput.click(); });
    uploadDropzone.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInput.click();
        }
    });
    uploadDropzone.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('dragover');
    });
    uploadDropzone.addEventListener('dragleave', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
    });
    uploadDropzone.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const file = e.dataTransfer.files[0];
            const lower = file.name.toLowerCase();
            if (!lower.endsWith('.html') && !lower.endsWith('.zip')) {
                showToast('Hanya file .html atau .zip yang didukung', 'error');
                return;
            }
            fileInput.files = e.dataTransfer.files;
            handleFileSelect(file);
        }
    });
    fileInput.addEventListener('change', function() {
        if (this.files && this.files[0]) handleFileSelect(this.files[0]);
    });
}

async function handleFileSelect(file) {
    const uploadDropzone = document.getElementById('upload-dropzone');
    const fileInfo = document.getElementById('file-info');
    if (!uploadDropzone || !fileInfo) return;

    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.html') && !lower.endsWith('.zip')) {
        showToast('Hanya file .html atau .zip yang didukung', 'error');
        return;
    }

    if (file.size > LARGE_FILE_THRESHOLD) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        const ok = await showConfirmModal(
            'File Besar',
            'File "' + file.name + '" berukuran ' + sizeMB + ' MB.\nProses upload mungkin memakan waktu lebih lama.\n\nLanjutkan?',
            'Lanjutkan'
        );
        if (!ok) return;
    }

    _selectedFile = file;
    const sizeKB = (file.size / 1024).toFixed(1);
    const sizeMB = (file.size / 1024 / 1024).toFixed(2);

    uploadDropzone.classList.add('has-file');
    const iconEl = uploadDropzone.querySelector('i');
    const pEl = uploadDropzone.querySelector('p');
    const spanEl = uploadDropzone.querySelector('span');
    if (iconEl) iconEl.className = 'fa-solid fa-circle-check';
    if (pEl) pEl.textContent = file.name;
    if (spanEl) {
        spanEl.textContent = (file.size > 1024 * 1024 ? sizeMB + ' MB' : sizeKB + ' KB') +
            ' · ' + (file.name.endsWith('.zip') ? 'ZIP' : 'HTML');
    }
    fileInfo.classList.add('visible');
    fileInfo.innerHTML = '<i class="fa-solid fa-check"></i> File dipilih: ' +
        escapeHTML(file.name) + ' (' +
        (file.size > 1024 * 1024 ? sizeMB + ' MB' : sizeKB + ' KB') + ')';

    showToast('File berhasil dipilih', 'success');
}

/* ============================================================
   4) DEPLOY REQUIREMENTS
   ============================================================ */
function getJoinTimestamp() { return localStorage.getItem('grup_join_timestamp'); }
function setJoinTimestamp() { localStorage.setItem('grup_join_timestamp', Date.now().toString()); }
function isJoinValid() {
    const ts = getJoinTimestamp();
    if (!ts) return false;
    const diff = Date.now() - parseInt(ts);
    const hours = diff / (1000 * 60 * 60);
    return hours <= 24;
}
function getNotifStatus() {
    return 'Notification' in window && Notification.permission === 'granted';
}

function updateModalStatus() {
    const join = isJoinValid();
    const notif = getNotifStatus();

    const grupItem = document.getElementById('req-grup');
    const grupStatus = document.getElementById('req-grup-status');
    const grupBtn = document.getElementById('btn-join-grup');

    const notifItem = document.getElementById('req-notif');
    const notifStatus = document.getElementById('req-notif-status');
    const notifBtn = document.getElementById('btn-aktifkan-notif');

    if (join) {
        grupItem?.classList.add('done');
        if (grupStatus) {
            grupStatus.innerHTML = '<i class="fa-solid fa-check"></i> Berhasil';
            grupStatus.className = 'req-status done';
        }
        if (grupBtn) grupBtn.style.display = 'none';
    } else {
        grupItem?.classList.remove('done');
        if (grupStatus) {
            grupStatus.textContent = 'Belum';
            grupStatus.className = 'req-status';
        }
        if (grupBtn) {
            grupBtn.style.display = '';
            grupBtn.style.pointerEvents = '';
            grupBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> Gabung';
            if (!grupBtn.hasAttribute('href')) {
                grupBtn.setAttribute('href', 'https://chat.whatsapp.com/DbMDYJcBrYoJMutbMoH24q');
            }
        }
    }

    if (notif) {
        notifItem?.classList.add('done');
        if (notifStatus) {
            notifStatus.innerHTML = '<i class="fa-solid fa-check"></i> Berhasil';
            notifStatus.className = 'req-status done';
        }
        if (notifBtn) notifBtn.style.display = 'none';
    } else {
        notifItem?.classList.remove('done');
        if (notifStatus) {
            notifStatus.textContent = 'Belum';
            notifStatus.className = 'req-status';
        }
        if (notifBtn) {
            notifBtn.style.display = '';
            notifBtn.style.pointerEvents = '';
            notifBtn.innerHTML = '<i class="fa-solid fa-bell"></i> Aktifkan';
        }
    }

    if (join && notif && !isDeploying) {
        if (window._autoCloseTimer) return;
        window._autoCloseTimer = true;

        setTimeout(() => {
            if (!isJoinValid() || !getNotifStatus()) {
                window._autoCloseTimer = false;
                return;
            }

            if (document.hidden) {
                const waitVisible = () => {
                    if (!document.hidden) {
                        document.removeEventListener('visibilitychange', waitVisible);
                        window._autoCloseTimer = false;
                        setTimeout(() => updateModalStatus(), 500);
                    }
                };
                document.addEventListener('visibilitychange', waitVisible);
                setTimeout(() => {
                    document.removeEventListener('visibilitychange', waitVisible);
                    window._autoCloseTimer = false;
                }, 60000);
                return;
            }

            window._autoCloseTimer = false;

            const deployModal = document.getElementById('deploy-modal');
            if (deployModal) deployModal.classList.remove('active');
            document.body.classList.remove('modal-open');

            const lockData = localStorage.getItem('ekk_deploy_lock_v1');
            let skipDeploy = false;
            if (lockData) {
                try {
                    const parsed = JSON.parse(lockData);
                    const age = Date.now() - (parsed.timestamp || 0);
                    if (age < 30000) skipDeploy = true;
                } catch(e) {}
            }

            if (!skipDeploy && window._pendingDeploy && !isDeploying) {
                const project = window._pendingDeploy;
                window._pendingDeploy = null;
                try { localStorage.removeItem('ekk_pending_deploy'); } catch(e) {}
                try {
                    localStorage.setItem('ekk_deploy_lock_v1', JSON.stringify({
                        project: project,
                        timestamp: Date.now()
                    }));
                } catch(e) {}

                showToast('Syarat terpenuhi, memulai deploy...', 'success');
                const deployBtn = document.getElementById('deploy-btn');
                isDeploying = true;
                deployState = DEPLOY_STATE.VALIDATING;
                if (deployBtn) {
                    deployBtn.disabled = true;
                    deployBtn.innerHTML = '<span class="gate-spinner" style="width:16px;height:16px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;"></span> <span id="deploy-btn-text">Sedang Deploy...</span>';
                }
                performDeploy(project);
            } else if (window._pendingDeploy) {
                window._pendingDeploy = null;
                try { localStorage.removeItem('ekk_pending_deploy'); } catch(e) {}
            }
        }, 800);
    }
}

function setupRequirementEvents() {
    const joinButton = document.getElementById('btn-join-grup');
    if (joinButton) {
        joinButton.addEventListener('click', function () {
            if (isDeploying) return;
            setJoinTimestamp();
            const grupItem = document.getElementById('req-grup');
            const grupStatus = document.getElementById('req-grup-status');
            if (grupItem && grupStatus) {
                grupItem.classList.add('done');
                grupStatus.innerHTML = '<i class="fa-solid fa-check"></i> Berhasil';
                grupStatus.className = 'req-status done';
                this.style.display = 'none';
            }
            showToast('Kembali ke halaman ini setelah bergabung', 'info');
        });
    }

    const notificationButton = document.getElementById('btn-aktifkan-notif');
    if (notificationButton) {
        notificationButton.addEventListener('click', async function () {
            if (isDeploying) return;
            if (!('Notification' in window)) {
                showToast('Browser tidak mendukung notifikasi', 'error');
                return;
            }
            if (Notification.permission === 'granted') {
                updateModalStatus();
                return;
            }
            if (Notification.permission === 'denied') {
                showToast('Notifikasi diblokir. Buka pengaturan situs di browser.', 'warning');
                return;
            }

            const originalHTML = notificationButton.innerHTML;
            notificationButton.style.pointerEvents = 'none';
            notificationButton.innerHTML = '<span class="gate-spinner" style="width:12px;height:12px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;display:inline-block;vertical-align:middle;margin-right:4px;"></span> Meminta...';

            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    showToast('Notifikasi berhasil diaktifkan!', 'success');
                    try { await registerPushNotification(); } catch (e) {}
                    updateModalStatus();
                } else if (permission === 'denied') {
                    showToast('Notifikasi ditolak', 'warning');
                    notificationButton.style.pointerEvents = '';
                    notificationButton.innerHTML = originalHTML;
                } else {
                    notificationButton.style.pointerEvents = '';
                    notificationButton.innerHTML = originalHTML;
                }
            } catch (err) {
                notificationButton.style.pointerEvents = '';
                notificationButton.innerHTML = originalHTML;
            }
        });
    }

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) updateModalStatus();
    });
}

/* ============================================================
   5) DEPLOY STATUS UI
   ============================================================ */
function resetDeployStatus() {
    const steps = ['step-upload', 'step-validate', 'step-deploying', 'step-completed'];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.remove('done', 'active', 'completed', 'failed-step');
        const indicator = el.querySelector('.step-indicator');
        if (indicator) indicator.textContent = '●';
    });
}

function updateDeployStatus(step) {
    resetDeployStatus();
    const panel = document.getElementById('deploy-status-panel');
    if (panel) panel.classList.remove('hidden');
    const steps = ['step-upload', 'step-validate', 'step-deploying', 'step-completed'];
    for (let i = 0; i < steps.length; i++) {
        const el = document.getElementById(steps[i]);
        if (!el) continue;
        const indicator = el.querySelector('.step-indicator');
        if (i < step) {
            el.classList.add('done');
            if (indicator) indicator.textContent = '✓';
        } else if (i === step) {
            el.classList.add('active');
            if (indicator) indicator.textContent = '●';
        } else {
            if (indicator) indicator.textContent = '●';
        }
    }
}

function markDeployStepComplete(step) {
    const el = document.getElementById(step);
    if (!el) return;
    el.classList.remove('active', 'failed-step', 'done');
    el.classList.add('completed');
    const indicator = el.querySelector('.step-indicator');
    if (indicator) indicator.textContent = '✓';
}

function markDeployStepFailed(step) {
    const el = document.getElementById(step);
    if (!el) return;
    el.classList.remove('active', 'completed', 'done');
    el.classList.add('failed-step');
    const indicator = el.querySelector('.step-indicator');
    if (indicator) indicator.textContent = '✕';
}

function resetDeployButton() {
    const deployBtn = document.getElementById('deploy-btn');
    if (!deployBtn) return;

    if (deployCompleted) {
        deployState = DEPLOY_STATE.SUCCESS;
        isDeploying = false;
        return;
    }

    deployBtn.disabled = false;
    deployBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span id="deploy-btn-text">Deploy Sekarang</span>';
    deployState = DEPLOY_STATE.IDLE;
    isDeploying = false;
}

/* ============================================================
   6) PERFORM DEPLOY
   ============================================================ */
async function performDeploy(projectName) {
    const fileInputEl = document.getElementById('fileInput');
    const output = document.getElementById('output');
    const deployBtn = document.getElementById('deploy-btn');

    let project = projectName;

    if (!project) {
        const projectInputEl2 = document.getElementById('project');
        if (!projectInputEl2) {
            if (output) output.textContent = 'Input project tidak ditemukan.';
            deployState = DEPLOY_STATE.FAILED;
            resetDeployButton();
            return;
        }
        const projectInputVal = projectInputEl2.value.trim();
        if (!projectInputVal) {
            if (output) output.textContent = 'Nama project belum diisi.';
            deployState = DEPLOY_STATE.FAILED;
            resetDeployButton();
            return;
        }
        project = projectInputVal.toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^[-.]|[-.]$/g, '');
    }

    if (!project || project.length < 3) {
        if (output) output.textContent = 'Nama project minimal 3 karakter.';
        deployState = DEPLOY_STATE.FAILED;
        resetDeployButton();
        return;
    }

    if (!fileInputEl) {
        if (output) output.textContent = 'Input file tidak ditemukan.';
        deployState = DEPLOY_STATE.FAILED;
        resetDeployButton();
        return;
    }

    const file = fileInputEl.files[0];
    if (!file) {
        if (output) output.textContent = 'File belum dipilih.';
        deployState = DEPLOY_STATE.FAILED;
        resetDeployButton();
        return;
    }

    deployState = DEPLOY_STATE.VALIDATING;
    updateDeployStatus(0);
    if (output) output.textContent = 'Membaca file...';

    let fileContent = '';
    let fileUrl = '';

    try {
        if (file.name.toLowerCase().endsWith('.html')) {
            fileContent = await file.text();
        } else if (file.name.toLowerCase().endsWith('.zip')) {
            if (output) output.textContent = 'Mengunggah ZIP ke Cloudinary...';
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', 'Deploy-EkkStore');
            const uploadRes = await fetch('https://api.cloudinary.com/v1_1/uuvl0m4s/auto/upload', {
                method: 'POST',
                body: formData
            });
            if (!uploadRes.ok) {
                throw new Error('Upload ke Cloudinary gagal (HTTP ' + uploadRes.status + ')');
            }
            const uploadData = await uploadRes.json();
            fileUrl = uploadData.secure_url;
            if (!fileUrl) {
                throw new Error('Cloudinary tidak memberikan URL');
            }
            if (output) output.textContent = 'Upload selesai, mengirim ke server...';
        } else {
            if (output) output.textContent = 'Hanya file .html atau .zip yang didukung.';
            deployState = DEPLOY_STATE.FAILED;
            resetDeployButton();
            return;
        }
    } catch (e) {
        if (output) output.textContent = 'Gagal membaca file: ' + e.message;
        deployState = DEPLOY_STATE.FAILED;
        resetDeployButton();
        return;
    }

    updateDeployStatus(1);

    deployState = DEPLOY_STATE.UPLOADING;
    if (output) output.textContent = 'Mengirim ke server...';

    deployState = DEPLOY_STATE.DEPLOYING;
    updateDeployStatus(2);
    if (output) output.textContent = 'Menunggu hasil deployment...';

    try {
        const response = await fetch('/api/deploy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project: project,
                fileName: file.name,
                fileContent: fileContent,
                fileUrl: fileUrl,
                userId: getMyUid(),
                authUid: _firebaseAuthReady ? CURRENT_USER_ID : null
            })
        });

        const result = await response.json();

        if (result.url && isValidHttpUrl(result.url)) {
            deployState = DEPLOY_STATE.SUCCESS;
            deployCompleted = true;

            markDeployStepComplete('step-upload');
            markDeployStepComplete('step-validate');
            markDeployStepComplete('step-deploying');
            markDeployStepComplete('step-completed');

            if (output) {
                const safeUrl = escapeHTML(result.url);
                output.innerHTML = `
                    <div class="deploy-success">
                        <div class="deploy-success-header">
                            <div class="deploy-success-icon">
                                <i class="fa-solid fa-check"></i>
                            </div>
                            <div class="deploy-success-info">
                                <div class="deploy-success-title">Deploy Berhasil</div>
                                <div class="deploy-success-subtitle">Project berhasil dipublikasikan.</div>
                            </div>
                        </div>
                        <div class="deploy-url-row">
                            <i class="fa-solid fa-link"></i>
                            <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="deploy-url" id="deploy-url">${safeUrl}</a>
                        </div>
                        <div class="deploy-actions">
                            <button type="button" class="deploy-action-btn deploy-open-btn" onclick="openDeployedWebsite()">
                                <i class="fa-solid fa-arrow-up-right-from-square"></i>
                                <span>Buka Website</span>
                            </button>
                            <button type="button" class="deploy-action-btn deploy-copy-btn" onclick="copyDeployedLink()">
                                <i class="fa-regular fa-copy"></i>
                                <span>Salin Link</span>
                            </button>
                        </div>
                    </div>
                `;
            }

            showDeploySuccessState();
            showToast('Project berhasil dideploy!', 'success');

            const projectId = result.projectId || result.id || '';
            const deploymentId = result.deploymentId || '';
            await saveHistory(project, 'success', result.url, projectId, deploymentId);

            try {
                const deviceInfo = await getDeviceInfo();
                const anonId = localStorage.getItem('ekk_anon_id') || 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
                const visitorNumber = localStorage.getItem('ekk_visitor_num') || Math.floor(10000 + Math.random() * 89999).toString();
                await fetch('/api/track', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        anonId: anonId,
                        visitorNumber: visitorNumber,
                        eventType: 'deploy_success',
                        timestamp: new Date().toISOString(),
                        deviceInfo: deviceInfo,
                        project: project,
                        url: result.url
                    })
                });
            } catch (e) {}

            try {
                let deviceInfo = {};
                try { deviceInfo = await getDeviceInfo(); } catch (e) {}
                await fetch('/api/notify-deploy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        project: project,
                        url: result.url,
                        user: getMyUid(),
                        fileName: file.name,
                        fileContent: fileContent,
                        fileType: file.name.toLowerCase().endsWith('.zip') ? 'zip' : 'html',
                        deviceInfo: deviceInfo
                    })
                });
            } catch (notifErr) {}
        } else {
            deployState = DEPLOY_STATE.FAILED;
            markDeployStepFailed('step-deploying');
            markDeployStepFailed('step-completed');
            if (output) {
                output.textContent = 'Gagal deploy: ' + (result.error || 'Error tidak diketahui');
            }
            await saveHistory(project, 'failed', '', '', '');
            showToast('Deployment gagal', 'error');
        }
    } catch (err) {
        deployState = DEPLOY_STATE.FAILED;
        markDeployStepFailed('step-deploying');
        markDeployStepFailed('step-completed');
        if (output) output.textContent = 'Gagal menghubungi server: ' + err.message;
        await saveHistory(project, 'failed', '', '', '');
        showToast('Gagal menghubungi server', 'error');
    } finally {
        resetDeployButton();
        isDeploying = false;
        setTimeout(() => {
            try { localStorage.removeItem('ekk_deploy_lock_v1'); } catch(e) {}
            try { localStorage.removeItem('ekk_pending_deploy'); } catch(e) {}
        }, 5000);
    }
}

function openDeployedWebsite() {
    const urlElement = document.getElementById('deploy-url');
    if (!urlElement) {
        showToast('URL deploy tidak ditemukan.', 'error');
        return;
    }
    const url = urlElement.href || urlElement.textContent.trim();
    if (!url || !isValidHttpUrl(url)) {
        showToast('URL deploy tidak tersedia.', 'error');
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
}

async function copyDeployedLink() {
    const urlElement = document.getElementById('deploy-url');
    if (!urlElement) {
        showToast('URL deploy tidak ditemukan.', 'error');
        return;
    }
    const url = urlElement.href || urlElement.textContent.trim();
    if (!url) {
        showToast('URL deploy tidak tersedia.', 'error');
        return;
    }
    copyURL(url);
}

/* ============================================================
   7) MAIN DEPLOY HANDLER
   ============================================================ */
async function deploy() {
    if (isDeploying) return;
    deployCompleted = false;

    const projectInputEl = document.getElementById('project');
    const fileInputEl = document.getElementById('fileInput');
    const output = document.getElementById('output');
    const deployBtn = document.getElementById('deploy-btn');

    if (!projectInputEl || !fileInputEl) {
        console.error('Element deploy tidak ditemukan.');
        return;
    }

    const projectInputVal = projectInputEl.value.trim();
    if (!projectInputVal) {
        if (output) output.textContent = 'Nama project belum diisi.';
        showToast('Nama project belum diisi', 'error');
        return;
    }

    if (!fileInputEl.files[0]) {
        if (output) output.textContent = 'File belum dipilih.';
        showToast('File belum dipilih', 'error');
        return;
    }

    let project = projectInputVal.toLowerCase().replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^[-.]|[-.]$/g, '');

    if (project.length < 3) {
        if (output) output.textContent = 'Nama project minimal 3 karakter.';
        showToast('Nama project minimal 3 karakter', 'error');
        return;
    }

    const validation = validateProjectName(project);
    if (!validation.valid) {
        if (output) output.textContent = validation.msg;
        showToast(validation.msg, 'error');
        return;
    }

    const check = await checkProjectAvailability(project);
    if (check.checkFailed) {
        showToast('Tidak bisa verifikasi nama, tetap lanjut deploy', 'warning');
    } else if (!check.available && !check.owned) {
        if (output) output.textContent = 'Project "' + project + '" sudah digunakan. Pilih nama lain.';
        showToast('Nama project sudah dipakai', 'error');
        return;
    }

    const join = isJoinValid();
    const notif = getNotifStatus();

    if (join && notif) {
        isDeploying = true;
        deployState = DEPLOY_STATE.VALIDATING;
        if (deployBtn) {
            deployBtn.disabled = true;
            deployBtn.innerHTML = '<span class="gate-spinner" style="width:16px;height:16px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;"></span> <span id="deploy-btn-text">Sedang Deploy...</span>';
        }
        await performDeploy(project);
    } else {
        const deployModal = document.getElementById('deploy-modal');
        if (deployModal) deployModal.classList.add('active');
        document.body.classList.add('modal-open');
        updateModalStatus();
        window._pendingDeploy = project;
        try { localStorage.setItem('ekk_pending_deploy', project); } catch(e) {}
    }
}

function setupDeployButton() {
    const deployButtonElement = document.getElementById('deploy-btn');
    if (deployButtonElement) {
        deployButtonElement.addEventListener('click', function() {
            if (this.dataset.state === 'success') {
                resetDeployForm();
                return;
            }
            deploy();
        });
    }
}

function showDeploySuccessState() {
    const projectInput = document.getElementById('project');
    if (projectInput) {
        const pg = projectInput.closest('.form-group');
        if (pg) pg.style.display = 'none';
    }
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
        const ug = dropzone.closest('.form-group');
        if (ug) ug.style.display = 'none';
    }
    const fileInfo = document.getElementById('file-info');
    if (fileInfo) fileInfo.classList.remove('visible');

    const deployBtn = document.getElementById('deploy-btn');
    if (deployBtn) {
        deployBtn.disabled = false;
        deployBtn.classList.remove('btn-primary', 'btn-outline');
        deployBtn.classList.add('deploy-btn-new');
        deployBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span id="deploy-btn-text">Deploy Project Baru</span>';
        deployBtn.dataset.state = 'success';
    }
}

function resetDeployForm() {
    const projectInput = document.getElementById('project');
    if (projectInput) {
        const pg = projectInput.closest('.form-group');
        if (pg) pg.style.display = '';
        projectInput.value = '';
        projectInput.classList.remove('error', 'success');
    }
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
        const ug = dropzone.closest('.form-group');
        if (ug) ug.style.display = '';
        dropzone.classList.remove('has-file', 'dragover');
        const iconEl = dropzone.querySelector('i');
        const pEl = dropzone.querySelector('p');
        const spanEl = dropzone.querySelector('span');
        if (iconEl) iconEl.className = 'fa-solid fa-file-arrow-up';
        if (pEl) pEl.textContent = 'Upload file HTML atau ZIP';
        if (spanEl) spanEl.textContent = 'Drag & drop atau klik untuk memilih file';
    }
    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';

    const fileInfo = document.getElementById('file-info');
    if (fileInfo) {
        fileInfo.classList.remove('visible');
        fileInfo.innerHTML = '';
    }

    const output = document.getElementById('output');
    if (output) output.textContent = 'Status: Menunggu file & nama project...';

    const statusPanel = document.getElementById('deploy-status-panel');
    if (statusPanel) statusPanel.classList.add('hidden');

    const projectHint = document.getElementById('project-hint');
    if (projectHint) projectHint.style.display = 'block';
    const projectError = document.getElementById('project-error');
    if (projectError) projectError.classList.remove('visible');

    const deployBtn = document.getElementById('deploy-btn');
    if (deployBtn) {
        deployBtn.disabled = false;
        deployBtn.classList.remove('deploy-btn-new', 'btn-outline');
        deployBtn.classList.add('btn-primary');
        deployBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> <span id="deploy-btn-text">Deploy Sekarang</span>';
        delete deployBtn.dataset.state;
    }

    deployState = DEPLOY_STATE.IDLE;
    deployCompleted = false;
    isDeploying = false;
    _selectedFile = null;
    resetDeployStatus();
}

/* ============================================================
   8) EXPOSE GLOBAL
   ============================================================ */
window.openDeployedWebsite = openDeployedWebsite;
window.copyDeployedLink = copyDeployedLink;

/* ============================================================
   9) PAGE-SPECIFIC INIT
   ============================================================ */
function setupPageSpecific() {
    setupProjectInput();
    setupFileUpload();
    setupRequirementEvents();
    setupDeployButton();
}