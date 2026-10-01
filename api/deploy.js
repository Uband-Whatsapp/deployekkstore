import JSZip from 'jszip';
import admin from 'firebase-admin';

// Init Firebase Admin (sekali aja)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Rate limit sederhana (in-memory, reset tiap function cold start)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 jam
const RATE_LIMIT_MAX = 5; // max 5 deploy per jam per UID

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan' });
  }

  const { project, fileContent, fileUrl, fileName, userId, authUid } = req.body;

  // ═══ 1. Verifikasi authUid ke Firebase ═══
  if (!authUid || typeof authUid !== 'string' || authUid.length < 20) {
    return res.status(401).json({ error: 'Autentikasi diperlukan' });
  }

  let decodedToken;
  try {
    // Kalau client kirim ID token, verify ke Firebase
    // Tapi karena client kirim UID (bukan token), kita cek manual ke Firestore
    const userDoc = await db.collection('users').doc(authUid).get();
    if (!userDoc.exists) {
      return res.status(401).json({ error: 'User tidak terdaftar' });
    }
    decodedToken = { uid: authUid };
  } catch (e) {
    return res.status(401).json({ error: 'Verifikasi gagal: ' + e.message });
  }

  // ═══ 2. Rate limit per UID ═══
  const now = Date.now();
  const userKey = authUid;
  const userHistory = (rateLimitMap.get(userKey) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (userHistory.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: `Rate limit: max ${RATE_LIMIT_MAX} deploy per jam` });
  }
  userHistory.push(now);
  rateLimitMap.set(userKey, userHistory);

  // ═══ 3. Validasi nama project ═══
  if (!project || typeof project !== 'string') {
    return res.status(400).json({ error: 'Project name wajib' });
  }
  const projectClean = project.toLowerCase().trim();
  if (!/^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/.test(projectClean)) {
    return res.status(400).json({
      error: 'Nama project harus 4-50 karakter, huruf kecil/angka/dash saja'
    });
  }
  // Blokir nama mencurigakan
  const blockedPrefixes = ['linn', 'admin', 'vercel', 'ekkstore-official'];
  if (blockedPrefixes.some(p => projectClean.startsWith(p))) {
    return res.status(400).json({ error: 'Nama project tidak diizinkan' });
  }

  if (!fileName) {
    return res.status(400).json({ error: 'File harus diisi' });
  }

  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  if (!VERCEL_TOKEN) {
    return res.status(500).json({ error: 'Konfigurasi server tidak lengkap' });
  }

  // ═══ 4. Sisa logic (sama seperti sebelumnya) ═══
  let files = [];
  let base64Zip = '';

  try {
    if (fileName.endsWith('.html')) {
      if (!fileContent) {
        return res.status(400).json({ error: 'Konten HTML kosong' });
      }
      if (fileContent.length > 5 * 1024 * 1024) { // max 5 MB
        return res.status(400).json({ error: 'File HTML terlalu besar (max 5MB)' });
      }
      files = [{ file: 'index.html', data: fileContent, encoding: 'utf-8' }];
    } else if (fileName.endsWith('.zip')) {
      if (fileUrl) {
        const zipRes = await fetch(fileUrl);
        if (!zipRes.ok) {
          return res.status(400).json({ error: 'Gagal download ZIP dari Cloudinary' });
        }
        const arrayBuffer = await zipRes.arrayBuffer();
        base64Zip = Buffer.from(arrayBuffer).toString('base64');
      } else if (fileContent) {
        base64Zip = fileContent;
      } else {
        return res.status(400).json({ error: 'URL ZIP atau fileContent harus ada' });
      }
      files = await extractZipToFiles(base64Zip);
    } else {
      return res.status(400).json({ error: 'File harus .html atau .zip' });
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (files.length === 0) {
    return res.status(400).json({ error: 'File kosong' });
  }

  if (!files.find(f => f.file === 'index.html')) {
    return res.status(400).json({
      error: 'ZIP harus punya index.html di root. Jangan masukkan file ke dalam folder.'
    });
  }

  try {
    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: projectClean,
        target: 'production',
        files: files,
        projectSettings: { framework: null, outputDirectory: '.' }
      })
    });

    const data = await deployRes.json();

    if (!data.id) {
      const errorMsg = data.error?.message || 'Unknown error';
      return res.status(500).json({ error: 'Gagal deploy: ' + errorMsg });
    }

    const finalUrl = `https://${projectClean}.vercel.app`;

    return res.status(200).json({
      success: true,
      url: finalUrl,
      projectId: data.projectId || data.id,
      deploymentId: data.id,
      fileCount: files.length
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Terjadi error: ' + err.message });
  }
}

async function extractZipToFiles(base64Content) {
  const buffer = Buffer.from(base64Content, 'base64');
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.keys(zip.files);

  let stripPrefix = '';
  const validEntries = entries.filter(n => !zip.files[n].dir);
  if (validEntries.length > 0) {
    const firstFolder = validEntries[0].split('/')[0];
    if (firstFolder && validEntries.every(name => name.startsWith(firstFolder + '/'))) {
      stripPrefix = firstFolder + '/';
    }
  }

  const files = [];

  for (const name of entries) {
    if (zip.files[name].dir) continue;
    if (name.startsWith('__MACOSX/')) continue;
    if (name.split('/').some(part => part.startsWith('.'))) continue;

    let filePath = name;
    if (stripPrefix && filePath.startsWith(stripPrefix)) {
      filePath = filePath.slice(stripPrefix.length);
    }
    if (!filePath) continue;

    const content = await zip.files[name].async('base64');
    files.push({
      file: filePath,
      data: content,
      encoding: 'base64'
    });
  }

  return files;
}