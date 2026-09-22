
import JSZip from 'jszip';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan' });
  }

  const { project, fileContent, fileUrl, fileName, userId } = req.body;

  if (!project || !fileName) {
    return res.status(400).json({ error: 'Project dan file harus diisi' });
  }

  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  if (!VERCEL_TOKEN) {
    return res.status(500).json({ error: 'Konfigurasi server tidak lengkap' });
  }

  let files = [];
  let base64Zip = '';

  try {
    if (fileName.endsWith('.html')) {
      if (!fileContent) {
        return res.status(400).json({ error: 'Konten HTML kosong' });
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