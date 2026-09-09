// api/update-profil.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[update-profile] ✅ Firebase Admin initialized');
  } catch (error) {
    console.error('[update-profile] ❌ Init error:', error.message);
  }
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

  if (!db) {
    return res.status(500).json({ error: 'Firebase Admin not initialized' });
  }

  try {
    const existing = await db.collection('users').where('username', '==', username).get();
    if (!existing.empty) {
      const doc = existing.docs[0];
      if (doc.id !== uid) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    await db.collection('users').doc(uid).set({
      username: username,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`[update-profile] ✅ Success update uid: ${uid}`);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('[update-profile] ❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
}