import { kv } from '@vercel/kv';
import { sendTelegramMessage } from '../lib/telegram.js';

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

  // Tentukan tanggal hari ini (WIB, GMT+7)
  const today = getTodayWIB();
  const key = `pengunjung:${today}`;

  // Simpan event ke database (Vercel KV)
  const eventData = { anonId, visitorNumber, eventType, timestamp };
  await kv.lpush(key, JSON.stringify(eventData));

  // Kirim notifikasi ke Telegram
  if (eventType === 'visit') {
    const msg = `👤 PENGUNJUNG BARU\n\n🆔 ID: #${visitorNumber}\n📌 Status: Masih di Gerbang Follow`;
    await sendTelegramMessage(msg);
  } else if (eventType === 'follow_passed') {
    const time = new Date(timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const msg = `✅ BERHASIL MELEWATI FOLLOW\n\n🆔 ID: #${visitorNumber}\n📌 Status: Berhasil\n🕐 Waktu: ${time}`;
    await sendTelegramMessage(msg);
  }

  res.status(200).json({ success: true });
}

function getTodayWIB() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}
