// api/deploy.js

export default async function handler(req, res) {
  // Hanya boleh menerima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan' });
  }

  // Ambil data yang dikirim dari frontend
  const { project, fileContent, fileName } = req.body;

  if (!project || !fileContent) {
    return res.status(400).json({ error: 'Project dan file harus diisi' });
  }

  // 🔥 INI RAHASIA! Diambil dari Environment Variables (Vercel Dashboard)
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  // Siapkan file untuk dikirim ke Vercel
  let files = [];
  if (fileName.endsWith('.html')) {
    // Kalau HTML, kirim langsung sebagai teks
    files = [{ file: 'index.html', data: fileContent }];
  } else if (fileName.endsWith('.zip')) {
    // Kalau ZIP, kirim sebagai base64
    files = [{ file: 'archive.zip', data: fileContent, encoding: 'base64' }];
  } else {
    return res.status(400).json({ error: 'File harus .html atau .zip' });
  }

  try {
    // --- PROSES DEPLOY KE VERCEL ---
    const deployRes = await fetch('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: project,
        target: 'production',
        files: files,
        projectSettings: { framework: null, outputDirectory: '.' }
      })
    });

    const data = await deployRes.json();

    if (!data.id) {
      return res.status(500).json({ error: 'Gagal deploy: ' + (data.error?.message || 'Unknown error') });
    }

    const finalUrl = `https://${project}.vercel.app`;

    // --- KIRIM NOTIFIKASI KE TELEGRAM (PAKAI TOKEN RAHASIA) ---
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: `✅ Deploy Berhasil!\nNama: ${project}\nURL: ${finalUrl}\nUser: ${req.body.userId || 'Anonim'}`
        })
      });
    } catch (teleErr) {
      console.log('Notif Telegram gagal, tapi deploy tetap sukses.');
    }

    // Kirim hasil sukses ke Frontend
    return res.status(200).json({ success: true, url: finalUrl });

  } catch (err) {
    return res.status(500).json({ error: 'Terjadi error: ' + err.message });
  }
      }
