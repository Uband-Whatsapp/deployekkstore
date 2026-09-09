// api/update-profile.js
import admin from 'firebase-admin';

// Inisialisasi Admin SDK
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[update-profile] ✅ Firebase Admin initialized');
  } catch (error) {
    console.error('[update-profile] ❌ Init error:', error.message);
    // Jika gagal init, kita tetap export handler yang return error
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // Hanya PATCH
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, username } = req.body;
  if (!uid || !username) {
    return res.status(400).json({ error: 'uid and username are required' });
  }

  // Cek apakah Admin SDK berhasil init
  if (!db) {
    return res.status(500).json({ error: 'Firebase Admin not initialized. Check env var.' });
  }

  try {
    // Cek username unik (kecuali milik sendiri)
    const existing = await db.collection('users').where('username', '==', username).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      if (doc.id !== uid) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    // Update username
    await db.collection('users').doc(uid).set({
      username: username,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`[update-profile] ✅ Success update uid: ${uid} -> ${username}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[update-profile] ❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}