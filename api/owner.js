const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    )
  });
}

const db = admin.firestore();

module.exports = async (req, res) => {
  try {

    if (req.method === "GET") {
      const { project } = req.query;

      if (!project) {
        return res.json({});
      }

      const doc = await db.collection("projects").doc(project).get();

      if (!doc.exists) {
        return res.json({});
      }

      return res.json(doc.data());
    }

    if (req.method === "POST") {
      const { project, ownerId, url = "" } = req.body;

      if (!project || !ownerId) {
        return res.status(400).json({
          error: "Missing project or ownerId"
        });
      }

      await db.collection("projects").doc(project).set({
        ownerId,
        url
      });

      return res.json({
        success: true
      });
    }

    if (req.method === "DELETE") {
      const { project } = req.body;

      if (!project) {
        return res.status(400).json({
          error: "Missing project"
        });
      }

      await db.collection("projects").doc(project).delete();

      return res.json({
        success: true
      });
    }

    return res.status(405).json({
      error: "Method Not Allowed"
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: err.message
    });
  }
};
