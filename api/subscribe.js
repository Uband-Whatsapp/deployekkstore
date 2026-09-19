import admin from 'firebase-admin';

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

export default async function handler(req, res) {
  console.log('📨 SUBSCRIBE: menerima request');
  console.log('📨 Method:', req.method);
  console.log('📨 Body:', req.body);

  if (req.method !== 'POST') {
    console.log('❌ Method not allowed');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { anonId, subscription } = req.body;
  if (!anonId || !subscription) {
    return res.status(400).json({ error: 'Data tidak lengkap' });
  }

  try {
    // Simpan subscription di Firestore, key by anonId agar tidak duplikat
    await db.collection('push_subscriptions').doc(anonId).set({
      subscription: subscription,
      updatedAt: new Date().toISOString()
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Gagal simpan subscription:', err);
    res.status(500).json({ error: err.message });
  }
}
