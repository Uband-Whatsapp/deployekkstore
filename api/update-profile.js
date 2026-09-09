// api/update-profile.js
import admin from 'firebase-admin';

// Inisialisasi Firebase Admin (hanya sekali)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[update-profile] Firebase Admin initialized');
  } catch (error) {
    console.error('[update-profile] Init error:', error.message);
    throw error;
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  console.log('[update-profile] Method:', req.method);

  // Hanya menerima PATCH
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, username } = req.body;

  // Validasi input
  if (!uid || !username) {
    return res.status(400).json({ error: 'uid and username are required' });
  }

  try {
    // Cek apakah username sudah dipakai user lain
    const existing = await db.collection('users').where('username', '==', username).get();
    
    if (!existing.empty) {
      const doc = existing.docs[0];
      if (doc.id !== uid) {
        return res.status(400).json({ error: 'Username already taken by another user' });
      }
    }

    // Update username
    await db.collection('users').doc(uid).update({
      username: username,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('[update-profile] Success for uid:', uid);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[update-profile] Error:', error);
    res.status(500).json({ 
      error: 'Failed to update profile: ' + error.message 
    });
  }
}