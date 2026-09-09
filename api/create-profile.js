// api/create-profile.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, username, avatar } = req.body;

  if (!uid || !username) {
    return res.status(400).json({ error: 'uid and username are required' });
  }

  try {
    // Cek lagi username unik
    const existing = await db.collection('users').where('username', '==', username).get();
    if (!existing.empty) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Simpan user
    await db.collection('users').doc(uid).set({
      username: username,
      avatar: avatar || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      isOnline: true,
    });

    // Kirim pesan join
    await db.collection('messages').add({
      senderId: uid,
      username: username,
      avatar: avatar || '',
      text: `${username} bergabung ke grup`,
      type: 'join',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update total member (opsional)
    const metaRef = db.collection('group_meta').doc('meta');
    await metaRef.set(
      { memberCount: admin.firestore.FieldValue.increment(1) },
      { merge: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error creating profile:', error);
    res.status(500).json({ error: 'Failed to create profile' });
  }
}