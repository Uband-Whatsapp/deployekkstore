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

  // Validasi
  if (!uid || !username) {
    return res.status(400).json({ error: 'uid and username are required' });
  }

  try {
    // Cek lagi username unik (untuk jaga-jaga)
    const existing = await db.collection('users').where('username', '==', username).get();
    if (!existing.empty) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Simpan user
    await db.collection('users').doc(uid).set({
      username: username,
      avatar: avatar || '', // bisa kosong
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      isOnline: true,
    });

    // Kirim pesan "bergabung" ke collection messages
    await db.collection('messages').add({
      senderId: uid, // kita pakai uid user sebagai pengirim (agar bisa dikenali sebagai "Anda")
      username: username,
      avatar: avatar || '',
      text: `${username} bergabung ke grup`, // pesan default
      type: 'join', // kita beri tipe join
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update total member di group_meta (opsional)
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