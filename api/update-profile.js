// api/update-profile.js
import admin from 'firebase-admin';

// ============================================================
// INISIALISASI FIREBASE ADMIN (DENGAN ERROR HANDLING)
// ============================================================
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[update-profile] ✅ Firebase Admin initialized');
  } catch (error) {
    console.error('[update-profile] ❌ Init error:', error.message);
    // Jangan throw, biar handler bisa return error
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  // ============================================================
  // 1. Cek method
  // ============================================================
  if (req.method !== 'PATCH') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use PATCH.' 
    });
  }

  // ============================================================
  // 2. Validasi input
  // ============================================================
  const { uid, username } = req.body;

  if (!uid) {
    return res.status(400).json({ 
      success: false, 
      error: 'uid is required' 
    });
  }

  if (!username || username.trim() === '') {
    return res.status(400).json({ 
      success: false, 
      error: 'username is required' 
    });
  }

  const trimmedUsername = username.trim();

  // ============================================================
  // 3. Cek apakah Admin SDK berhasil inisialisasi
  // ============================================================
  if (!db) {
    return res.status(500).json({ 
      success: false, 
      error: 'Firebase Admin SDK not initialized. Check FIREBASE_SERVICE_ACCOUNT env var.' 
    });
  }

  try {
    // ============================================================
    // 4. Cek apakah username sudah dipakai user lain
    // ============================================================
    const existingUsers = await db.collection('users')
      .where('username', '==', trimmedUsername)
      .get();

    if (!existingUsers.empty) {
      const doc = existingUsers.docs[0];
      if (doc.id !== uid) {
        return res.status(400).json({ 
          success: false, 
          error: 'Username already taken by another user' 
        });
      }
    }

    // ============================================================
    // 5. Update username (pakai set dengan merge agar aman)
    // ============================================================
    await db.collection('users').doc(uid).set({
      username: trimmedUsername,
      lastSeen: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`[update-profile] ✅ Success update uid: ${uid} -> ${trimmedUsername}`);

    return res.status(200).json({ 
      success: true,
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('[update-profile] ❌ Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to update profile: ' + error.message 
    });
  }
}