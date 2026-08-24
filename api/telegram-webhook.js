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

// ========== IMPORT FUNGSI TELEGRAM DI AWAL ==========
let sendTelegramMessage;
try {
  const module = await import('../lib/telegram.js');
  sendTelegramMessage = module.sendTelegramMessage;
  console.log('✅ sendTelegramMessage berhasil diimport');
} catch (err) {
  console.error('❌ Gagal import sendTelegramMessage:', err.message);
  // Fungsi dummy agar tidak error
  sendTelegramMessage = async (text, chatId) => {
    console.log('⚠️ Fungsi sendTelegramMessage dummy dipanggil. Pesan:', text);
  };
}
// ===================================================

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

  // ===== PERINTAH /notif =====
  if (text.startsWith('/notif')) {
    const pesan = text.replace('/notif', '').trim();
    if (!pesan) {
      await sendTelegramMessage('❌ Format: /notif <pesan>', chatId);
      res.status(200).json({ success: true });
      return;
    }

    try {
      // Kirim notifikasi ke semua subscriber
      const response = await fetch(`https://deploy.project.ekkstore.web.id/api/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Ekk Store',
          body: pesan,
          icon: 'https://files.catbox.moe/kzg0nc.png',
          url: 'https://deploy.project.ekkstore.web.id/'
        })
      });
      const result = await response.json();
      await sendTelegramMessage(`✅ Notifikasi dikirim ke ${result.success || 0} perangkat dari ${result.total || 0} subscriber.`, chatId);
    } catch (err) {
      console.error('Gagal kirim notifikasi via bot:', err);
      await sendTelegramMessage('❌ Gagal mengirim notifikasi. Cek log Vercel.', chatId);
    }
    res.status(200).json({ success: true });
    return;
  }

  // ===== PERINTAH /laporanpengunjung =====
  if (text === '/laporanpengunjung') {
    const today = getTodayWIB();

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

    // Ambil jumlah deploy berhasil hari ini
    const deploySnapshot = await db.collection('pengunjung')
      .where('date', '==', today)
      .where('eventType', '==', 'deploy_success')
      .get();
    const totalDeploy = deploySnapshot.size;

    // Ambil jumlah subscriber notifikasi
    const subSnapshot = await db.collection('push_subscriptions').get();
    const totalSubscribers = subSnapshot.size;

    const laporan = `📊 LAPORAN PENGUNJUNG

👥 Total Pengunjung: ${total}
✅ Berhasil Melewati Follow: ${success}
⏳ Belum Melewati Follow: ${belum}
🚀 Total Deploy Berhasil: ${totalDeploy}
📢 Total Subscriber Notifikasi: ${totalSubscribers}

🕐 Periode: 00:00 - sekarang`;

    await sendTelegramMessage(laporan, chatId);
    res.status(200).json({ success: true });
    return;
  }

  // Perintah lain tidak dikenali
  res.status(200).json({ success: true });
}

function getTodayWIB() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}
