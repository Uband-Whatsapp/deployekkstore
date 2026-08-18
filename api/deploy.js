// api/deploy.js

export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan' });
  }

  // Ambil data dari frontend
  const { project, fileContent, fileName, userId } = req.body;

  if (!project || !fileContent) {
    return res.status(400).json({ error: 'Project dan file harus diisi' });
  }

  // Ambil token dari Environment Variables (aman, tidak terlihat di frontend)
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

  // Pastikan token ada
  if (!VERCEL_TOKEN || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Token tidak lengkap di environment variables');
    return res.status(500).json({ error: 'Konfigurasi server tidak lengkap' });
  }

  // Siapkan file untuk dikirim ke Vercel
  let files = [];
  if (fileName.endsWith('.html')) {
    files = [{ file: 'index.html', data: fileContent }];
  } else if (fileName.endsWith('.zip')) {
    files = [{ file: 'archive.zip', data: fileContent, encoding: 'base64' }];
  } else {
    return res.status(400).json({ error: 'File harus .html atau .zip' });
  }

  try {
    // --- 1. DEPLOY KE VERCEL ---
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
      const errorMsg = data.error?.message || 'Unknown error';
      return res.status(500).json({ error: 'Gagal deploy: ' + errorMsg });
    }

    const finalUrl = `https://${project}.vercel.app`;

    // --- 2. KIRIM NOTIFIKASI KE TELEGRAM (pakai token rahasia) ---
    try {
      const pesan = `✅ Deploy Berhasil!\nNama: ${project}\nURL: ${finalUrl}\nUser: ${userId || 'Anonim'}\nWaktu: ${new Date().toLocaleString('id-ID')}`;
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: pesan,
          parse_mode: 'HTML'
        })
      });
    } catch (teleErr) {
      // Notif gagal tidak menggagalkan deploy
      console.log('Notifikasi Telegram gagal, tapi deploy tetap sukses.');
    }

    // Kirim hasil sukses ke frontend
    return res.status(200).json({ success: true, url: finalUrl });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Terjadi error: ' + err.message });
  }
}
