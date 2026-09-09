// api/create-profile.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[create-profile] ✅ Firebase Admin initialized');
  } catch (error) {
    console.error('[create-profile] ❌ Init error:', error.message);
  }
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
    // Cek username unik
    const existing = await db.collection('users').where('username', '==', username).get();
    if (!existing.empty) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // ============================================================
    // SIMPAN USER DENGAN FIELD BATASAN 2x/MINGGU
    // ============================================================
    await db.collection('users').doc(uid).set({
      username: username,
      avatar: avatar || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      isOnline: true,
      // ======== TAMBAHKAN 4 FIELD INI ========
      usernameChangeCount: 0,
      usernameChangeReset: admin.firestore.FieldValue.serverTimestamp(),
      avatarChangeCount: 0,
      avatarChangeReset: admin.firestore.FieldValue.serverTimestamp(),
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

    // Update member count
    const metaRef = db.collection('group_meta').doc('meta');
    await metaRef.set(
      { memberCount: admin.firestore.FieldValue.increment(1) },
      { merge: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[create-profile] ❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}