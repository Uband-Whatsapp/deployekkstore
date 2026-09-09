// api/check-username.js
import admin from 'firebase-admin';

// Inisialisasi Admin SDK (hanya sekali)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

export default async function handler(req, res) {
  // Hanya menerima method GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;
  if (!username || username.trim() === '') {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Cari user dengan username yang sama (case-sensitive, kita pakai exact match)
    const snapshot = await db.collection('users').where('username', '==', username.trim()).get();
    const exists = !snapshot.empty;
    res.status(200).json({ exists });
  } catch (error) {
    console.error('Error checking username:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}