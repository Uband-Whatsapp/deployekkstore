import admin from 'firebase-admin';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { anonId, subscription } = req.body;
  if (!anonId || !subscription) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }

  try {
    await db.collection('push_subscriptions').doc(anonId).set({
      subscription: subscription,
      updatedAt: new Date().toISOString()
    });

    console.log(`✅ Subscriber baru tersimpan: ${anonId}`);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Gagal simpan subscription:', err);
    res.status(500).json({ error: err.message });
  }
}