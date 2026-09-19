import admin from 'firebase-admin';
import webpush from 'web-push';

if (!admin.apps.length) {
  const serviceAccountStr = process.env.FIREBASE_VISITOR_SERVICE_ACCOUNT;
  if (!serviceAccountStr) throw new Error('FIREBASE_VISITOR_SERVICE_ACCOUNT belum diatur');
  const serviceAccount = JSON.parse(serviceAccountStr);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const VAPID_PUBLIC_KEY = 'BPXIBP6nsxkkYmrHpkkBQsZDwVnnyAYKbGupNOTls_HcOQVC39iI0eLHJtx4qGv5AJHmDYNnxz5PeE6fYZ3BINk';
const VAPID_PRIVATE_KEY = 'uxUkgwgAFK32C6l5gXxeYdTvOSTcgg3rSfP2TCiuoMo';

webpush.setVapidDetails('mailto:ekkstore.id@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export default async function handler(req, res) {
  // GET → hitung subscriber
  if (req.method === 'GET') {
    try {
      const snapshot = await db.collection('push_subscriptions').get();
      return res.status(200).json({ count: snapshot.size });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, icon, url, image, requireInteraction, vibrate, tag } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Title dan body wajib diisi' });
  }

  try {
    const snapshot = await db.collection('push_subscriptions').get();
    const subscriptions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.subscription) subscriptions.push(data.subscription);
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
      image: image || undefined,
      tag: tag || 'ekk-store-notif',
      vibrate: vibrate || [200, 100, 200],
      requireInteraction: true,
      url: url || 'https://deploy.project.ekkstore.web.id/'
    });

    const results = [];
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        results.push({ success: true });
      } catch (err) {
        console.error('❌ Gagal:', err.statusCode, err.message);
        results.push({ success: false, error: err.message });
      }
    }

    const total = results.length;
    const successCount = results.filter(r => r.success).length;
    res.status(200).json({ total, success: successCount });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ error: err.message });
  }
}