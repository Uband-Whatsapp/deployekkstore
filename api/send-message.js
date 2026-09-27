import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[send-message] Firebase Admin initialized');
  } catch (error) {
    console.error('[send-message] Init error:', error.message);
  }
}

const db = admin.firestore();

const ALLOWED_MEDIA_TYPES = ['image', 'video', 'audio', 'file'];
const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    uid,
    authUid,
    username,
    avatar,
    text,
    replyTo,
    mediaUrl,
    mediaType,
    fileName,
    fileSize,
    duration,
  } = req.body || {};

  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'uid is required' });
  }

  if (!authUid || typeof authUid !== 'string' || authUid.length < 20) {
    return res.status(401).json({ error: 'Autentikasi diperlukan' });
  }

  if (authUid !== uid) {
    return res.status(401).json({ error: 'UID tidak cocok' });
  }

  const hasText = text && typeof text === 'string' && text.trim().length > 0;
  const hasMedia = mediaUrl && typeof mediaUrl === 'string';

  if (!hasText && !hasMedia) {
    return res.status(400).json({ error: 'text or mediaUrl is required' });
  }

  if (hasText && text.length > 4000) {
    return res.status(400).json({ error: 'Pesan terlalu panjang' });
  }

  let safeMediaType = 'file';
  if (hasMedia) {
    if (mediaType && ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      safeMediaType = mediaType;
    } else if (mediaType) {
      safeMediaType = 'file';
    }
  }

  if (hasMedia && typeof fileSize === 'number' && fileSize > MAX_FILE_SIZE) {
    return res.status(400).json({
      error: `File too large. Max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB`,
    });
  }

  if (hasMedia && !/^https?:\/\//i.test(mediaUrl)) {
    return res.status(400).json({ error: 'Invalid mediaUrl format' });
  }

  let safeReplyTo = null;
  if (replyTo && typeof replyTo === 'object') {
    safeReplyTo = {
      docId: String(replyTo.docId || ''),
      username: String(replyTo.username || 'unknown'),
      text: String(replyTo.text || '').slice(0, 500),
    };
  }

  try {
    const messageData = {
      senderId: uid,
      username: (username || 'Anonymous').slice(0, 50),
      avatar: avatar || '',
      text: hasText ? text.slice(0, 4000) : '',
      type: 'text',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (hasMedia) {
      messageData.mediaUrl = mediaUrl;
      messageData.mediaType = safeMediaType;
      messageData.fileName = fileName ? String(fileName).slice(0, 200) : '';
      messageData.fileSize = typeof fileSize === 'number' ? fileSize : 0;
      messageData.type = safeMediaType;

      if (safeMediaType === 'audio') {
        const dur = Number(duration);
        messageData.duration = (Number.isFinite(dur) && dur > 0) ? Math.round(dur) : 0;
      }
    }

    if (safeReplyTo && safeReplyTo.docId) {
      messageData.replyTo = safeReplyTo;
    }

    await db.collection('messages').add(messageData);

    try {
      await db.collection('users').doc(uid).update({
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        isOnline: true,
      });
    } catch (userErr) {
      console.warn('[send-message] User update failed:', userErr.message);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[send-message] Error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}