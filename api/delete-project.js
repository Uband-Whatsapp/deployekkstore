export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId, ownerId, authUid } = req.body;

  if (!projectId || !ownerId) {
    return res.status(400).json({ error: 'projectId dan ownerId wajib diisi' });
  }

  if (!authUid || typeof authUid !== 'string' || authUid.length < 20) {
    return res.status(401).json({ error: 'Autentikasi diperlukan' });
  }

  if (authUid !== ownerId) {
    return res.status(403).json({ error: 'Tidak boleh hapus project orang lain' });
  }

  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  if (!VERCEL_TOKEN) {
    console.error('VERCEL_TOKEN tidak ditemukan di environment');
    return res.status(500).json({ error: 'Token Vercel tidak tersedia' });
  }

  try {
    const vercelRes = await fetch(`https://api.vercel.com/v9/projects/${projectId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${VERCEL_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!vercelRes.ok) {
      const errorData = await vercelRes.json();
      console.error('Gagal hapus dari Vercel:', errorData);
      return res.status(vercelRes.status).json({
        error: 'Gagal hapus dari Vercel',
        detail: errorData,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Project ${projectId} berhasil dihapus dari Vercel`,
    });
  } catch (err) {
    console.error('Error saat hapus project:', err);
    return res.status(500).json({ error: 'Terjadi error internal: ' + err.message });
  }
}