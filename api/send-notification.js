import admin from 'firebase-admin';
import webpush from 'web-push';

if (!admin.apps.length) {
  const serviceAccountStr = process.env.FIREBASE_VISITOR_SERVICE_ACCOUNT;
  if (!serviceAccountStr) throw new Error('FIREBASE_VISITOR_SERVICE_ACCOUNT belum diatur');
  const serviceAccount = JSON.parse(serviceAccountStr);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

const VAPID_PUBLIC_KEY = 'BPXIBP6nsxkkYmrHpkkBQsZDwVnnyAYKbGupNOTls_HcOQVC39iI0eLHJtx4qGv5AJHmDYNnxz5PeE6fYZ3BINk';
const VAPID_PRIVATE_KEY = 'uxUkgwgAFK32C6l5gXxeYdTvOSTcgg3rSfP2TCiuoMo';

webpush.setVapidDetails('mailto:ekkstore.id@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const action = req.query.action;

    try {
      if (action === 'stats') {
        const days = parseInt(req.query.days || '0', 10);
        return await handleStats(res, days);
      }

      // Default: hitung subscriber (untuk dashboard admin)
      const snapshot = await db.collection('push_subscriptions').get();
      return res.status(200).json({ count: snapshot.size });
    } catch (err) {
      console.error('[send-notification][GET]', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { title, body, icon, url, image, requireInteraction, vibrate, tag } = req.body;
  if (!title || !body) {
    return res.status(400).json({ error: 'Title dan body wajib diisi' });
  }

  try {
    const snapshot = await db.collection('push_subscriptions').get();
    const subscriptions = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.subscription) subscriptions.push(data.subscription);
    });

    console.log(`📨 Total subscriber: ${subscriptions.length}`);
    if (subscriptions.length === 0) {
      return res.status(200).json({ message: 'Tidak ada subscriber', total: 0 });
    }

    const payload = JSON.stringify({
      title: title,
      body: body,
      icon: icon || 'https://files.catbox.moe/kzg0nc.png',
      badge: icon || 'https://files.catbox.moe/kzg0nc.png',
      image: image || undefined,
      tag: tag || 'ekk-store-notif',
      vibrate: vibrate || [200, 100, 200],
      requireInteraction: true,
      url: url || 'https://deploy.project.ekkstore.web.id/'
    });

    const results = [];
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(sub, payload);
        results.push({ success: true });
      } catch (err) {
        console.error('❌ Gagal:', err.statusCode, err.message);
        results.push({ success: false, error: err.message });
      }
    }

    const total = results.length;
    const successCount = results.filter(r => r.success).length;
    res.status(200).json({ total, success: successCount });
  } catch (err) {
    console.error('❌ Error:', err);
    res.status(500).json({ error: err.message });
  }
}

async function handleStats(res, days) {
  const subSnap = await db.collection('push_subscriptions').count().get();
  const subscriber = subSnap.data().count;

  let pQuery = db.collection('pengunjung');
  if (days > 0) {
    const startDate = getDateWIB(-(days - 1));
    pQuery = pQuery.where('date', '>=', startDate);
  }
  const pSnap = await pQuery.get();

  const visitors = new Set();
  const followers = new Set();
  const clickers = new Set();
  const installers = new Set();

  pSnap.forEach(doc => {
    const d = doc.data();
    if (d.eventType === 'visit') visitors.add(d.anonId);
    else if (d.eventType === 'follow_passed') followers.add(d.anonId);
    else if (d.eventType === 'click_install') clickers.add(d.anonId);
    else if (d.eventType === 'install_app') installers.add(d.anonId);
  });

  const allVisitors = new Set([...visitors, ...followers]);

  // Per hari 14 hari terakhir
  const daySnap = await db.collection('pengunjung').get();
  const perDay = {};
  daySnap.forEach(doc => {
    const d = doc.data();
    if (!d.date) return;
    if (!perDay[d.date]) perDay[d.date] = { visit: new Set(), follow: new Set(), click_install: new Set(), install_app: new Set() };
    if (d.eventType === 'visit') perDay[d.date].visit.add(d.anonId);
    else if (d.eventType === 'follow_passed') perDay[d.date].follow.add(d.anonId);
    else if (d.eventType === 'click_install') perDay[d.date].click_install.add(d.anonId);
    else if (d.eventType === 'install_app') perDay[d.date].install_app.add(d.anonId);
  });

  const perDayArr = Object.keys(perDay).sort().slice(-14).map(date => ({
    date,
    visit: perDay[date].visit.size,
    follow: perDay[date].follow.size,
    click_install: perDay[date].click_install.size,
    install_app: perDay[date].install_app.size
  }));

  res.status(200).json({
    subscriber,
    pengunjung: {
      total: allVisitors.size,
      follow: followers.size,
      belum: allVisitors.size - followers.size,
      detail: perDayArr
    },
    apk: {
      click_install: clickers.size,
      install_app: installers.size
    },
    range: { days }
  });
}

function getDateWIB(offsetDays = 0) {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}