// api/send-message.js
import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[send-message] ✅ Firebase Admin initialized');
  } catch (error) {
    console.error('[send-message] ❌ Init error:', error.message);
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid, username, avatar, text, replyTo, mediaUrl, mediaType, fileName, fileSize } = req.body;

  if (!uid) {
    return res.status(400).json({ error: 'uid is required' });
  }

  // Minimal harus ada teks atau media
  if (!text && !mediaUrl) {
    return res.status(400).json({ error: 'text or mediaUrl is required' });
  }

  try {
    const messageData = {
      senderId: uid,
      username: username || 'Anonymous',
      avatar: avatar || '',
      text: text || '',
      type: 'text',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Tambahkan media jika ada
    if (mediaUrl) {
      messageData.mediaUrl = mediaUrl;
      messageData.mediaType = mediaType || 'file';
      messageData.fileName = fileName || '';
      messageData.fileSize = fileSize || 0;
      messageData.type = mediaType || 'file';
    }

    if (replyTo) {
      messageData.replyTo = replyTo;
    }

    await db.collection('messages').add(messageData);

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