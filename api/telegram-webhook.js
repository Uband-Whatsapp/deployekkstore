import { kv } from '@vercel/kv';
import { sendTelegramMessage } from '../lib/telegram.js';

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

  // Hanya admin yang boleh pakai command
  const adminChatId = process.env.ADMIN_CHAT_ID;
  if (String(chatId) !== adminChatId) {
    res.status(200).json({ success: true });
    return;
  }

  if (text === '/laporanpengujung') {
    const today = getTodayWIB();
    const key = `pengunjung:${today}`;
    const eventsRaw = await kv.lrange(key, 0, -1);
    const events = eventsRaw.map(e => JSON.parse(e));

    // Hitung statistik
    const visitors = new Set();
    const successVisitors = new Set();

    for (const event of events) {
      visitors.add(event.anonId);
      if (event.eventType === 'follow_passed') {
        successVisitors.add(event.anonId);
      }
    }

    const total = visitors.size;
    const success = successVisitors.size;
    const belum = total - success;

    const laporan = `📊 LAPORAN PENGUNJUNG\n\n👥 Total Pengunjung: ${total}\n✅ Berhasil Melewati Follow: ${success}\n⏳ Belum Melewati Follow: ${belum}\n\n🕐 Periode: 00:00 - sekarang`;

    await sendTelegramMessage(laporan, chatId);
  }

  res.status(200).json({ success: true });
}

function getTodayWIB() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}
