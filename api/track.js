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

  const { anonId, visitorNumber, eventType, timestamp, deviceInfo } = req.body;
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
    deviceInfo,
    date: today
  });

  // Mendapatkan lokasi dari IP
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

  const { sendTelegramMessage } = await import('../lib/telegram.js');

  const waktu = formatTimeWIB(timestamp);
  const deviceStr = formatDeviceInfo(deviceInfo);

  let msg;
  if (eventType === 'visit') {
    msg = `👤 PENGUNJUNG BARU\n\n🆔 ID: #${visitorNumber}\n📌 Status: Masih di Gerbang Follow\n🕐 Waktu: ${waktu}\n${deviceStr}\n${locationInfo}`;
  } else if (eventType === 'follow_passed') {
    msg = `✅ BERHASIL MELEWATI FOLLOW\n\n🆔 ID: #${visitorNumber}\n📌 Status: Berhasil\n🕐 Waktu: ${waktu}\n${deviceStr}\n${locationInfo}`;
  } else {
    res.status(200).json({ success: true });
    return;
  }

  await sendTelegramMessage(msg.trim());

  res.status(200).json({ success: true });
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

function formatTimeWIB(timestamp) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(timestamp)).replace(/\./g, ':');
}

function getTodayWIB() {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}
