const admin = require("firebase-admin");

if (!admin.apps.length) {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(key)
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  try {

    // GET cek owner
    if (req.method === "GET") {
      const project = req.query.project;

      if (!project) {
        return res.status(400).json({
          error: "project required"
        });
      }

      const doc = await db.collection("projects").doc(project).get();

      if (!doc.exists) {
        return res.json({});
      }

      return res.json(doc.data());
    }


    // POST simpan owner
    if (req.method === "POST") {
      const { project, ownerId, url } = req.body;

      if (!project || !ownerId) {
        return res.status(400).json({
          error: "missing data"
        });
      }

      await db.collection("projects").doc(project).set({
        ownerId,
        url: url || ""
      });

      return res.json({
        success: true
      });
    }


    res.status(405).json({
      error: "method not allowed"
    });

  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
};
