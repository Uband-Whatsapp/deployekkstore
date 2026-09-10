// /api/update-status-beacon.js
const admin = require('firebase-admin');

// Init Firebase Admin (kalo belum)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}

const db = admin.firestore();

module.exports = async (req, res) => {
    // Cuma terima POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { uid, isOnline } = req.body;
        if (!uid) {
            return res.status(400).json({ error: 'uid required' });
        }

        await db.collection('users').doc(uid).update({
            isOnline: isOnline === true,
            lastSeen: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ ok: true });
    } catch (err) {
        console.error('Update status error:', err);
        return res.status(500).json({ error: err.message });
    }
};