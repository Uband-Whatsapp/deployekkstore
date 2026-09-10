// api/update-status.js
import admin from 'firebase-admin';

// Inisialisasi Firebase Admin (hanya sekali)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[update-status] ✅ Firebase Admin initialized');
  } catch (error) {
    console.error('[update-status] ❌ Init error:', error.message);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // Hanya menerima method PATCH
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, isOnline } = req.body;

  // Validasi input
  if (!uid) {
    return res.status(400).json({ error: 'uid is required' });
  }

  try {
    await db.collection('users').doc(uid).update({
      isOnline: isOnline === true,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[update-status] ✅ uid: ${uid} -> isOnline: ${isOnline}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[update-status] ❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}