// api/send-message.js
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

  const { uid, username, avatar, text } = req.body;

  if (!uid || !text) {
    return res.status(400).json({ error: 'uid and text are required' });
  }

  try {
    await db.collection('messages').add({
      senderId: uid,
      username: username || 'Anonymous',
      avatar: avatar || '',
      text: text,
      type: 'text',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('users').doc(uid).update({
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      isOnline: true,
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
}