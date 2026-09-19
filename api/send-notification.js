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
const VAPID_PRIVATE_KEY = 'uxUkgwgAFK32C6l5gXxeYdTvOSTcgg3rSfP2TCiuoMo';

webpush.setVapidDetails(
  'mailto:ekkstore.id@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

export default async function handler(req, res) {
  // ============================================================
  // GET → untuk dashboard admin (baca jumlah subscriber)
  // Bot Telegram kirim POST, jadi TIDAK terpengaruh
  // ============================================================
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('push_subscriptions').get();
      return res.status(200).json({ count: snapshot.size });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ============================================================
  // POST → kirim notifikasi (IDENTIK dengan kode lama Anda)
  // ============================================================
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, icon, url, testMode } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Title dan body wajib diisi' });
  }

  try {
    const snapshot = await db.collection('push_subscriptions').get();
    const subscriptions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.subscription) {
        subscriptions.push(data.subscription);
      }
    });

    console.log(`📨 Total subscriber: ${subscriptions.length}`);

    if (subscriptions.length === 0) {
      return res.status(200).json({ message: 'Tidak ada subscriber', total: 0 });
    }

    const payload = JSON.stringify({
      title: title,
      body: body,
      icon: icon || 'https://files.catbox.moe/kzg0nc.png',
      badge: icon || 'https://files.catbox.moe/kzg0nc.png',
      url: url || 'https://deploy.project.ekkstore.web.id/'
    });

    // ⚠️ KUNCI: kalau testMode true → kirim 1 saja
    //    kalau testMode undefined (dari bot Telegram) → kirim SEMUA
    const targets = subscriptions;

    const results = [];
    for (const sub of targets) {
      try {
        await webpush.sendNotification(sub, payload);
        results.push({ success: true });
        console.log('✅ Notifikasi terkirim ke subscriber');
      } catch (err) {
        console.error('❌ Gagal kirim ke subscriber:', err.statusCode, err.message);
        results.push({ success: false, error: err.message });
      }
    }

    const total = results.length;
    const successCount = results.filter(r => r.success).length;
    res.status(200).json({ total, success: successCount });
  } catch (err) {
    console.error('❌ Error send-notification:', err);
    res.status(500).json({ error: err.message });
  }
}