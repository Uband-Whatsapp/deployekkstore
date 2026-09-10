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

// Whitelist media type yang diizinkan
const ALLOWED_MEDIA_TYPES = ['image', 'video', 'audio', 'file'];

// Batas ukuran file (bytes) — sesuaikan dengan limit Cloudinary lu
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    uid,
    username,
    avatar,
    text,
    replyTo,
    mediaUrl,
    mediaType,
    fileName,
    fileSize,
    duration,           // ← BARU: durasi audio dalam ms
  } = req.body || {};

  // ---------- VALIDASI ----------
  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'uid is required' });
  }

  // Harus ada teks atau media
  const hasText = text && typeof text === 'string' && text.trim().length > 0;
  const hasMedia = mediaUrl && typeof mediaUrl === 'string';

  if (!hasText && !hasMedia) {
    return res.status(400).json({ error: 'text or mediaUrl is required' });
  }

  // Validasi mediaType whitelist
  let safeMediaType = 'file';
  if (hasMedia) {
    if (mediaType && ALLOWED_MEDIA_TYPES.includes(mediaType)) {
      safeMediaType = mediaType;
    } else if (mediaType) {
      console.warn('[send-message] ⚠️ Invalid mediaType:', mediaType, '→ fallback to file');
      safeMediaType = 'file';
    }
  }

  // Validasi ukuran file
  if (hasMedia && typeof fileSize === 'number' && fileSize > MAX_FILE_SIZE) {
    return res.status(400).json({
      error: `File too large. Max ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB`,
    });
  }

  // Validasi URL media (harus http/https)
  if (hasMedia && !/^https?:\/\//i.test(mediaUrl)) {
    return res.status(400).json({ error: 'Invalid mediaUrl format' });
  }

  // Validasi replyTo
  let safeReplyTo = null;
  if (replyTo && typeof replyTo === 'object') {
    safeReplyTo = {
      docId: String(replyTo.docId || ''),
      username: String(replyTo.username || 'unknown'),
      text: String(replyTo.text || '').slice(0, 500),
    };
  }

  try {
    // ---------- BUILD MESSAGE ----------
    const messageData = {
      senderId: uid,
      username: (username || 'Anonymous').slice(0, 50),
      avatar: avatar || '',
      text: hasText ? text.slice(0, 4000) : '',
      type: 'text',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    // ---------- MEDIA ----------
    if (hasMedia) {
      messageData.mediaUrl = mediaUrl;
      messageData.mediaType = safeMediaType;
      messageData.fileName = fileName ? String(fileName).slice(0, 200) : '';
      messageData.fileSize = typeof fileSize === 'number' ? fileSize : 0;
      messageData.type = safeMediaType;

      // ── Audio: tambahkan durasi ──
      if (safeMediaType === 'audio') {
        const dur = Number(duration);
        messageData.duration = (Number.isFinite(dur) && dur > 0) ? Math.round(dur) : 0;
      }
    }

    // ---------- REPLY ----------
    if (safeReplyTo && safeReplyTo.docId) {
      messageData.replyTo = safeReplyTo;
    }

    // ---------- SIMPAN KE FIRESTORE ----------
    await db.collection('messages').add(messageData);

    // ---------- UPDATE USER STATUS ----------
    try {
      await db.collection('users').doc(uid).update({
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
        isOnline: true,
      });
    } catch (userErr) {
      // Kalau user doc gak ada, jangan gagalkan request — message udah tersimpan
      console.warn('[send-message] ⚠️ User update failed:', userErr.message);
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[send-message] ❌ Error:', error);
    return res.status(500).json({ error: 'Failed to send message' });
  }
}