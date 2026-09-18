import admin from 'firebase-admin';
import webpush from 'web-push';

// ============================================================
// FORCE init named app instance "visitor" — biar tidak bentrok
// dengan file API lain yang juga pakai firebase-admin
// ============================================================
let visitorApp;
try {
  visitorApp = admin.app('visitor');
} catch (e) {
  const serviceAccountStr = process.env.FIREBASE_VISITOR_SERVICE_ACCOUNT;
  if (!serviceAccountStr) {
    throw new Error('FIREBASE_VISITOR_SERVICE_ACCOUNT belum diatur');
  }
  const serviceAccount = JSON.parse(serviceAccountStr);
  visitorApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  }, 'visitor');
}

const db = visitorApp.firestore();

const VAPID_PUBLIC_KEY = 'BPXIBP6nsxkkYmrHpkkBQsZDwVnnyAYKbGupNOTls_HcOQVC39iI0eLHJtx4qGv5AJHmDYNnxz5PeE6fYZ3BINk';
const VAPID_PRIVATE_KEY = 'uxUkgwgAFK32C6l5gXxeYdTvOSTcgg3rSfP2TCiuoMo';

webpush.setVapidDetails(
  'mailto:ekkstore.id@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ============================================================
  // Logging info project — buat diagnosa
  // ============================================================
  const projectId = visitorApp.options.projectId;
  console.log(`🔑 Firebase project aktif: ${projectId}`);

  // ============================================================
  // GET = hitung subscriber (untuk admin panel)
  // ============================================================
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('push_subscriptions').get();
      console.log(`📊 GET count [${projectId}] → ${snapshot.size} subscriber`);
      return res.status(200).json({ count: snapshot.size, project: projectId });
    } catch (err) {
      console.error('❌ Gagal hitung subscriber:', err);
      return res.status(500).json({ error: err.message, project: projectId });
    }
  }

  // ============================================================
  // POST = kirim notifikasi
  // ============================================================
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, icon, url, image, badge, tag, vibrate, requireInteraction, testMode = false } = req.body;

  if (!title || !body) {
    return res.status(400).json({ error: 'Title dan body wajib diisi' });
  }

  try {
    const snapshot = await db.collection('push_subscriptions').get();
    const subscriptions = [];
    const docIds = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.subscription) {
        subscriptions.push(data.subscription);
        docIds.push(doc.id);
      }
    });

    console.log(`📨 [${projectId}] Total subscriber: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      return res.status(200).json({ total: 0, success: 0, message: 'Tidak ada subscriber', project: projectId });
    }

    const payload = JSON.stringify({
      title: title,
      body: body,
      icon: icon || image || 'https://files.catbox.moe/kzg0nc.png',
      badge: badge || icon || 'https://files.catbox.moe/kzg0nc.png',
      image: image || undefined,
      tag: tag || 'ekk-store-notif',
      url: url || 'https://deploy.project.ekkstore.web.id/',
      vibrate: vibrate || [200, 100, 200],
      requireInteraction: requireInteraction === true,
      data: { url: url || 'https://deploy.project.ekkstore.web.id/' }
    });

    const targets = testMode ? subscriptions.slice(0, 1) : subscriptions;
    console.log(`📤 ${testMode ? 'TEST' : 'BLAST'} → ${targets.length} target(s)`);

    let successCount = 0;
    let failCount = 0;
    const expiredDocIds = [];

    for (let i = 0; i < targets.length; i++) {
      const sub = targets[i];
      try {
        await webpush.sendNotification(sub, payload);
        successCount++;
      } catch (err) {
        failCount++;
        console.error(`❌ Gagal (${err.statusCode}):`, err.message);
        if (err.statusCode === 410 || err.statusCode === 404) {
          const idx = subscriptions.indexOf(sub);
          if (idx >= 0 && docIds[idx]) {
            expiredDocIds.push(docIds[idx]);
          }
        }
      }
    }

    if (expiredDocIds.length > 0) {
      const batch = db.batch();
      expiredDocIds.forEach(id => {
        batch.delete(db.collection('push_subscriptions').doc(id));
      });
      await batch.commit().catch(() => {});
    }

    res.status(200).json({
      total: targets.length,
      success: successCount,
      failed: failCount,
      cleaned: expiredDocIds.length,
      testMode: testMode,
      project: projectId
    });
  } catch (err) {
    console.error('❌ Error send-notification:', err);
    res.status(500).json({ error: err.message, project: projectId });
  }
}