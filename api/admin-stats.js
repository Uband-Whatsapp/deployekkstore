import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccountStr = process.env.FIREBASE_VISITOR_SERVICE_ACCOUNT;
  if (!serviceAccountStr) throw new Error('FIREBASE_VISITOR_SERVICE_ACCOUNT belum diatur');
  const serviceAccount = JSON.parse(serviceAccountStr);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const days = parseInt(req.query.days || '0', 10);
  const startDate = days > 0 ? getDateWIB(-days + 1) : null;

  try {
    // Subscribers
    const subSnap = await db.collection('push_subscriptions').count().get();
    const subscriber = subSnap.data().count;

    // Pengunjung
    let pQuery = db.collection('pengunjung');
    if (startDate) pQuery = pQuery.where('date', '>=', startDate);
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

    // Semua pengunjung unik
    const allVisitors = new Set([...visitors, ...followers]);

    // Detail per hari (7 hari terakhir)
    const detailSnap = await db.collection('pengunjung').get();
    const perDay = {};
    detailSnap.forEach(doc => {
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
      range: { days, startDate }
    });
  } catch (err) {
    console.error('[admin-stats]', err);
    res.status(500).json({ error: err.message });
  }
}

function getDateWIB(offsetDays = 0) {
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return wib.toISOString().split('T')[0];
}