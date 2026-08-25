// api/delete-project.js
export default async function handler(req, res) {
  // Hanya izinkan POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { projectId, ownerId } = req.body;
  if (!projectId || !ownerId) {
    return res.status(400).json({ error: 'projectId dan ownerId wajib diisi' });
  }

  // Ambil token Vercel dari environment (aman)
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  if (!VERCEL_TOKEN) {
    console.error('VERCEL_TOKEN tidak ditemukan di environment');
    return res.status(500).json({ error: 'Token Vercel tidak tersedia' });
  }

  try {
    // Hapus project dari Vercel
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

    // (Opsional) Hapus data pemilik dari Firestore
    // Kita asumsikan ada fungsi di lib/firestore.js atau langsung akses admin
    // Karena tidak ada firebase-admin di sini, kita serahkan ke frontend
    // Tapi di frontend sudah ada removeProjectOwner, jadi kita hanya perlu beri sinyal sukses

    return res.status(200).json({
      success: true,
      message: `Project ${projectId} berhasil dihapus dari Vercel`,
    });
  } catch (err) {
    console.error('Error saat hapus project:', err);
    return res.status(500).json({ error: 'Terjadi error internal: ' + err.message });
  }
}