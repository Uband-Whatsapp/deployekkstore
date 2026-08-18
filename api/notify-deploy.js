import { sendTelegramMessage } from '../lib/telegram.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { project, url, user, fileName, fileContent, fileType, deviceInfo } = req.body;
  if (!project || !url || !user) {
    res.status(400).json({ error: 'Data tidak lengkap' });
    return;
  }

  // Lokasi dari IP
  let locationInfo = '';
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,query`);
      const geoData = await geoRes.json();
      if (geoData.status === 'success') {
        locationInfo = `📍 Lokasi: ${geoData.city}, ${geoData.regionName}, ${geoData.country} (${geoData.isp})`;
      }
    }
  } catch(e) {
    console.warn('Gagal mendapatkan lokasi:', e.message);
  }

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

  const deviceStr = formatDeviceInfo(deviceInfo);

  let caption = `✅ Deploy Berhasil!\n\n📦 Project: ${project}\n🌐 URL: ${url}\n👤 User: ${user}\n🕐 Waktu: ${tanggal}, ${waktu} WIB\n${deviceStr}\n${locationInfo}`;

  try {
    await sendTelegramMessage(caption);

    if (fileContent && fileName) {
      const formData = new FormData();
      formData.append('chat_id', process.env.CHAT_ID);
      formData.append('caption', caption);

      if (fileType === 'zip') {
        const buffer = Buffer.from(fileContent, 'base64');
        formData.append('document', new Blob([buffer]), fileName);
      } else {
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

function formatDeviceInfo(deviceInfo) {
  if (!deviceInfo) return '';
  const brand = deviceInfo.brand || 'Unknown';
  const os = deviceInfo.os || 'Unknown';
  const browser = deviceInfo.browser || 'Unknown';
  const screen = deviceInfo.screen || 'Unknown';
  const pixelRatio = deviceInfo.pixelRatio || 1;
  const cores = deviceInfo.cores || 'Unknown';
  const memory = deviceInfo.memory || 'Unknown';

  let batteryStr = '';
  if (deviceInfo.battery && typeof deviceInfo.battery.level === 'number') {
    batteryStr = `🔋 Baterai: ${deviceInfo.battery.level}%${deviceInfo.battery.charging ? ' (Charging)' : ''}`;
  } else {
    batteryStr = '🔋 Baterai: Tidak tersedia';
  }

  let networkStr = '';
  if (deviceInfo.network && deviceInfo.network.effectiveType) {
    networkStr = `📶 Jaringan: ${deviceInfo.network.effectiveType} (${deviceInfo.network.downlink || '?'} Mbps, ${deviceInfo.network.rtt || '?'} ms)`;
  } else {
    networkStr = '📶 Jaringan: Tidak tersedia';
  }

  return `📱 Perangkat: ${brand} (${os})\n🌐 Browser: ${browser}\n🖥️ Layar: ${screen} (${pixelRatio}x)\n🧠 RAM: ${memory} GB | Core: ${cores}\n${batteryStr}\n${networkStr}`;
}
