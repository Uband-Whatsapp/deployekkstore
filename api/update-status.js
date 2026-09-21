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
  if (req.method === 'GET') {
    const action = req.query.action;
    if (action === 'deploy-stats') {
      try {
        const days = parseInt(req.query.days || '0', 10);
        return await handleDeployStats(res, days);
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
    console.error('[update-status] Error:', error);
    res.status(500).json({ error: error.message });
  }
}

async function handleDeployStats(res, days) {
  let pQuery = db.collection('projects');
  if (days > 0) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    pQuery = pQuery.where('createdAt', '>=', admin.firestore.Timestamp.fromDate(cutoff));
  }

  const snap = await pQuery.get();

  const global = { total: 0, success: 0, failed: 0, proses: 0 };
  const userMap = {};

  snap.forEach(doc => {
    const d = doc.data();
    const uid = d.ownerUid || 'unknown';
    const status = d.status || 'unknown';

    global.total++;
    if (status === 'success') global.success++;
    else if (status === 'failed') global.failed++;
    else global.proses++;

    if (!userMap[uid]) {
      userMap[uid] = {
        uid,
        total: 0, success: 0, failed: 0, proses: 0,
        last_deploy: null,
        projects: []
      };
    }

    const u = userMap[uid];
    u.total++;
    if (status === 'success') u.success++;
    else if (status === 'failed') u.failed++;
    else u.proses++;

    let tsISO = null;
    if (d.createdAt && typeof d.createdAt.toDate === 'function') {
      tsISO = d.createdAt.toDate().toISOString();
    } else if (d.createdAt instanceof Date) {
      tsISO = d.createdAt.toISOString();
    }

    u.projects.push({
      projectName: d.projectName || '',
      status: status,
      url: d.url || '',
      projectId: d.projectId || '',
      createdAt: tsISO
    });

    if (tsISO && (!u.last_deploy || tsISO > u.last_deploy)) {
      u.last_deploy = tsISO;
    }
  });

  // Lookup username per user
  const uids = Object.keys(userMap).filter(u => u !== 'unknown');
  const userProfiles = {};

  if (uids.length > 0) {
    const chunks = [];
    for (let i = 0; i < uids.length; i += 10) chunks.push(uids.slice(i, i + 10));
    for (const chunk of chunks) {
      const uSnap = await db.collection('users').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
      uSnap.forEach(doc => {
        const d = doc.data();
        userProfiles[doc.id] = {
          username: d.username || '',
          avatar: d.avatar || ''
        };
      });
    }
  }

  // Sort projects per user descending
  Object.values(userMap).forEach(u => {
    u.projects.sort((a, b) => {
      const ta = a.createdAt || '';
      const tb = b.createdAt || '';
      return tb.localeCompare(ta);
    });
  });

  const perUser = Object.values(userMap).map(u => {
    const profile = userProfiles[u.uid] || {};
    const shortUid = u.uid === 'unknown' ? 'unknown' : u.uid.slice(0, 10);
    return {
      uid: u.uid,
      username: profile.username || ('User ' + shortUid),
      has_profile: !!profile.username,
      avatar: profile.avatar || '',
      total: u.total,
      success: u.success,
      failed: u.failed,
      proses: u.proses,
      last_deploy: u.last_deploy,
      projects: u.projects
    };
  }).sort((a, b) => {
    const la = a.last_deploy || '';
    const lb = b.last_deploy || '';
    return lb.localeCompare(la);
  });

  res.status(200).json({
    global,
    per_user: perUser,
    range: { days }
  });
}