import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('[update-status] Init error:', error.message);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const action = req.query.action;
    if (action === 'deploy-stats') {
      try {
        const days = parseInt(req.query.days || '0', 10);
        const mode = req.query.mode || 'full';
        return await handleDeployStats(res, days, mode);
      } catch (err) {
        console.error('[update-status][deploy-stats]', err);
        return res.status(500).json({ error: err.message });
      }
    }
    return res.status(400).json({ error: 'action required' });
  }

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, isOnline } = req.body;
  if (!uid) return res.status(400).json({ error: 'uid is required' });

  try {
    await db.collection('users').doc(uid).update({
      isOnline: isOnline === true,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleDeployStats(res, days, mode) {
  const snap = await db.collection('projects').get();

  const cutoff = days > 0 ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

  const global = { total: 0, success: 0, failed: 0, proses: 0 };
  const userMap = {};
  const recentAll = [];

  snap.forEach(doc => {
    const d = doc.data();
    const uid = d.ownerUid || '';
    if (!uid || uid === 'unknown') return;

    let ts = null;
    if (d.createdAt && typeof d.createdAt.toDate === 'function') {
      ts = d.createdAt.toDate();
    } else if (d.createdAt instanceof Date) {
      ts = d.createdAt;
    } else if (typeof d.createdAt === 'string') {
      ts = new Date(d.createdAt);
    }

    if (cutoff && ts && ts < cutoff) return;

    const status = d.status || 'unknown';
    global.total++;
    if (status === 'success') global.success++;
    else if (status === 'failed') global.failed++;
    else global.proses++;

    if (!userMap[uid]) {
      userMap[uid] = {
        uid, total: 0, success: 0, failed: 0, proses: 0,
        last_deploy: null, projects: []
      };
    }
    const u = userMap[uid];
    u.total++;
    if (status === 'success') u.success++;
    else if (status === 'failed') u.failed++;
    else u.proses++;

    const tsISO = ts ? ts.toISOString() : null;

    if (tsISO && (!u.last_deploy || tsISO > u.last_deploy)) {
      u.last_deploy = tsISO;
    }

    const proj = {
      projectName: d.projectName || '',
      status: status,
      url: d.url || '',
      projectId: d.projectId || '',
      createdAt: tsISO,
      ownerUid: uid
    };

    recentAll.push(proj);

    if (mode === 'full') {
      u.projects.push(proj);
    }
  });

  if (mode === 'summary') {
    recentAll.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const recent = recentAll.slice(0, 8);

    const uids = [...new Set(recent.map(p => p.ownerUid).filter(Boolean))];
    const profiles = await getProfiles(uids);

    const recentWithProfile = recent.map(p => ({
      ...p,
      username: profiles[p.ownerUid]?.username || ('User ' + p.ownerUid.slice(0, 10)),
      has_profile: !!profiles[p.ownerUid]?.username,
      avatar: profiles[p.ownerUid]?.avatar || ''
    }));

    return res.status(200).json({
      global,
      recent: recentWithProfile,
      range: { days }
    });
  }

  const uids = Object.keys(userMap);
  const profiles = await getProfiles(uids);

  Object.values(userMap).forEach(u => {
    u.projects.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  });

  const perUser = Object.values(userMap).map(u => {
    const p = profiles[u.uid] || {};
    return {
      uid: u.uid,
      username: p.username || ('User ' + u.uid.slice(0, 10)),
      has_profile: !!p.username,
      avatar: p.avatar || '',
      total: u.total,
      success: u.success,
      failed: u.failed,
      proses: u.proses,
      last_deploy: u.last_deploy,
      projects: u.projects
    };
  }).sort((a, b) => (b.last_deploy || '').localeCompare(a.last_deploy || ''));

  res.status(200).json({
    global,
    per_user: perUser,
    range: { days }
  });
}

async function getProfiles(uids) {
  const profiles = {};
  const valid = uids.filter(u => u && u !== 'unknown');
  if (valid.length === 0) return profiles;

  const chunks = [];
  for (let i = 0; i < valid.length; i += 10) chunks.push(valid.slice(i, i + 10));

  for (const chunk of chunks) {
    try {
      const snap = await db.collection('users')
        .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
        .get();
      snap.forEach(doc => {
        const d = doc.data();
        profiles[doc.id] = {
          username: d.username || '',
          avatar: d.avatar || ''
        };
      });
    } catch (e) {
      console.warn('[getProfiles]', e.message);
    }
  }
  return profiles;
}