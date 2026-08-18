import { sendTelegramMessage } from '../lib/telegram.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { project, url, user, fileName, fileContent, fileType } = req.body;
  if (!project || !url || !user) {
    res.status(400).json({ error: 'Data tidak lengkap' });
    return;
  }

  // Waktu dalam WIB
  const waktu = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date()).replace(/\./g, ':');

  const tanggal = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  let caption = `✅ Deploy Berhasil!\n\n📦 Project: ${project}\n🌐 URL: ${url}\n👤 User: ${user}\n🕐 Waktu: ${tanggal}, ${waktu} WIB`;

  try {
    // Kirim pesan teks terlebih dahulu
    await sendTelegramMessage(caption);

    // Jika ada file, kirim sebagai dokumen
    if (fileContent && fileName) {
      const formData = new FormData();
      formData.append('chat_id', process.env.CHAT_ID);
      formData.append('caption', caption);

      if (fileType === 'zip') {
        // fileContent adalah base64 untuk zip
        const buffer = Buffer.from(fileContent, 'base64');
        formData.append('document', new Blob([buffer]), fileName);
      } else {
        // file HTML sebagai teks
        formData.append('document', new Blob([fileContent], { type: 'text/html' }), fileName);
      }

      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`, {
        method: 'POST',
        body: formData
      });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Gagal kirim notif deploy:', error.message);
    res.status(500).json({ error: 'Gagal kirim notif deploy' });
  }
}
