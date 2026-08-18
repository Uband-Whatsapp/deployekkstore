import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccountStr = process.env.FIREBASE_VISITOR_SERVICE_ACCOUNT;
  if (!serviceAccountStr) {
    throw new Error('FIREBASE_VISITOR_SERVICE_ACCOUNT belum diatur');
  }
  const serviceAccount = JSON.parse(serviceAccountStr);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { anonId, visitorNumber, eventType, timestamp } = req.body;
  if (!anonId || !eventType) {
    res.status(400).json({ error: 'Data tidak lengkap' });
    return;
  }

  const today = getTodayWIB();

  await db.collection('pengunjung').add({
    anonId,
    visitorNumber,
    eventType,
    timestamp,
    date: today
  });

  const { sendTelegramMessage } = await import('../lib/telegram.js');

  if (eventType === 'visit') {
    const waktu = formatTime(timestamp);
    const msg = `👤 PENGUNJUNG BARU\n\n🆔 ID: #${visitorNumber}\n📌 Status: Masih di Gerbang Follow\n🕐 Waktu: ${waktu}`;
    await sendTelegramMessage(msg);
  } else if (eventType === 'follow_passed') {
    const waktu = formatTime(timestamp);
    const msg = `✅ BERHASIL MELEWATI FOLLOW\n\n🆔 ID: #${visitorNumber}\n📌 Status: Berhasil\n🕐 Waktu: ${waktu}`;
    await sendTelegramMessage(msg);
  }

  res.status(200).json({ success: true });
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString('id-ID', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(/\./g, ':');
}

function getTodayWIB() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}
