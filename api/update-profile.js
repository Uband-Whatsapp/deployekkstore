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
  if (req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, username } = req.body;

  if (!uid || !username) {
    return res.status(400).json({ error: 'uid and username are required' });
  }

  try {
    // Cek username unik kecuali milik sendiri
    const existing = await db.collection('users').where('username', '==', username).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      if (doc.id !== uid) {
        return res.status(400).json({ error: 'Username already taken by another user' });
      }
    }

    await db.collection('users').doc(uid).update({
      username: username,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}