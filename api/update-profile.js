// api/update-profile.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  // Tambahkan log untuk debugging
  console.log('[update-profile] Request received', req.method);

  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, username } = req.body;

  if (!uid || !username) {
    return res.status(400).json({ error: 'uid and username are required' });
  }

  try {
    // Cek apakah username sudah dipakai orang lain
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

    console.log('[update-profile] Update success for', uid);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[update-profile] ERROR:', error);
    res.status(500).json({ error: 'Failed to update profile: ' + error.message });
  }
}