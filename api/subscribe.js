import admin from 'firebase-admin';
import webpush from 'web-push';

if (!admin.apps.length) {
  const serviceAccountStr = process.env.FIREBASE_VISITOR_SERVICE_ACCOUNT;
  if (!serviceAccountStr) {
    throw new Error('FIREBASE_VISITOR_SERVICE_ACCOUNT belum diatur');
  }
  const serviceAccount = JSON.parse(serviceAccountStr);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const VAPID_PUBLIC_KEY = 'BPXIBP6nsxkkYmrHpkkBQsZDwVnnyAYKbGupNOTls_HcOQVC39iI0eLHJtx4qGv5AJHmDYNnxz5PeE6fYZ3BINk';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'uxUkgwgAFK32C6l5gXxeYdTvOSTcgg3rSfP2TCiuoMo';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ekkstore2024admin';

webpush.setVapidDetails(
  'mailto:ekkstore.id@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ============================================================
  // GET = hitung subscriber (untuk header admin)
  // ============================================================
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('push_subscriptions').count().get();
      const count = snapshot.data().count;
      return res.status(200).json({ count });
    } catch (err) {
      console.error('Gagal hitung subscriber:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // POST = kirim notifikasi
  // ============================================================
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== ADMIN_PASSWORD) {
    console.log('❌ Unauthorized attempt');
    return res.status(401).json({ error: 'Unauthorized' });
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

    console.log(`📨 Total subscriber: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      return res.status(200).json({ total: 0, success: 0, message: 'Tidak ada subscriber' });
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
      console.log(`🧹 Hapus ${expiredDocIds.length} subscription expired`);
      const batch = db.batch();
      expiredDocIds.forEach(id => {
        batch.delete(db.collection('push_subscriptions').doc(id));
      });
      await batch.commit().catch(e => console.error('Cleanup gagal:', e));
    }

    res.status(200).json({
      total: targets.length,
      success: successCount,
      failed: failCount,
      cleaned: expiredDocIds.length,
      testMode: testMode
    });
  } catch (err) {
    console.error('❌ Error send-notification:', err);
    res.status(500).json({ error: err.message });
  }
}