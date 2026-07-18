const admin = require("firebase-admin");

if (!admin.apps.length) {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(key)
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  const { project, ownerId, url } = req.body;

  await db.collection("projects").doc(project).set({
    ownerId,
    url
  });

  res.json({
    success: true
  });
};
