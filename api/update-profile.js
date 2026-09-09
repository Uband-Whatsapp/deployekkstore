// api/update-profile.js
import admin from 'firebase-admin';

// Inisialisasi Admin SDK (hanya sekali)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[update-profile] Firebase Admin initialized successfully');
  } catch (error) {
    console.error('[update-profile] Failed to initialize Firebase Admin:', error.message);
    throw error;
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  console.log('[update-profile] Request received', req.method, req.body);

  // Hanya menerima method PATCH
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, username } = req.body;

  // Validasi input
  if (!uid || !username) {
    console.log('[update-profile] Missing uid or username');
    return res.status(400).json({ error: 'uid and username are required' });
  }

  try {
    // Cek apakah username sudah dipakai oleh user lain
    const existing = await db.collection('users').where('username', '==', username).get();
    console.log('[update-profile] Existing users with that username:', existing.size);

    if (!existing.empty) {
      const doc = existing.docs[0];
      if (doc.id !== uid) {
        // Username sudah dipakai oleh orang lain
        return res.status(400).json({ error: 'Username already taken by another user' });
      }
    }

    // Update username dan lastSeen
    await db.collection('users').doc(uid).update({
      username: username,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('[update-profile] Update successful for uid:', uid);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[update-profile] ERROR:', error);
    res.status(500).json({
      error: 'Failed to update profile: ' + error.message,
      stack: error.stack // untuk debugging (hapus nanti)
    });
  }
}