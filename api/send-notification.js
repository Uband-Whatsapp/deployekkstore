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
  if (req.method === 'GET') {
    try {
      const countSnap = await db.collection('push_subscriptions').count().get();
      return res.status(200).json({ count: countSnap.data().count });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') {
  return res.status(405).json({ error: 'Method not allowed' });
}

if (req.body && req.body.action === 'login') {
  const pwd = req.body.password || '';
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD belum diset di Vercel' });
  }
  if (pwd === expected) {
    return res.status(200).json({ success: true });
  }
  return res.status(401).json({ error: 'Password salah' });
}

  const { title, body, icon, url } = req.body;
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

    console.log(`Total subscriber: ${subscriptions.length}`);

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

    const results = [];
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        results.push({ success: true });
      } catch (err) {
        results.push({ success: false, error: err.message });
      }
    }

    const total = results.length;
    const successCount = results.filter(r => r.success).length;
    res.status(200).json({ total, success: successCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}