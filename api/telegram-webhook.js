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

  const { message } = req.body;
  if (!message || !message.text) {
    res.status(200).json({ success: true });
    return;
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (String(chatId) !== adminChatId) {
    res.status(200).json({ success: true });
    return;
  }

  if (text === '/laporanpengunjung') {
  const today = getTodayWIB();

  // Ambil semua pengunjung hari ini
  const snapshot = await db.collection('pengunjung')
    .where('date', '==', today)
    .get();

  const visitors = new Set();
  const successVisitors = new Set();

  snapshot.forEach(doc => {
    const data = doc.data();
    visitors.add(data.anonId);
    if (data.eventType === 'follow_passed') {
      successVisitors.add(data.anonId);
    }
  });

  const total = visitors.size;
  const success = successVisitors.size;
  const belum = total - success;

  // ===== TAMBAHAN: AMBIL JUMLAH DEPLOY BERHASIL HARI INI =====
  const deploySnapshot = await db.collection('pengunjung')
    .where('date', '==', today)
    .where('eventType', '==', 'deploy_success')
    .get();

  const totalDeploy = deploySnapshot.size;
  // ===== AKHIR TAMBAHAN =====

  const laporan = `📊 LAPORAN PENGUNJUNG

👥 Total Pengunjung: ${total}
✅ Berhasil Melewati Follow: ${success}
⏳ Belum Melewati Follow: ${belum}
🚀 Total Deploy Berhasil: ${totalDeploy}

🕐 Periode: 00:00 - sekarang`;

  const { sendTelegramMessage } = await import('../lib/telegram.js');
  await sendTelegramMessage(laporan, chatId);
  }

  res.status(200).json({ success: true });
}

function getTodayWIB() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}
