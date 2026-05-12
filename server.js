const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data.json');
const IMAGES_DIR = path.join(ROOT, 'images');
const PUBLIC_DIR = path.join(ROOT, 'public');

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ items: [] }, null, 2));

const readData = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

const EXT_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
};

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/images', express.static(IMAGES_DIR));

app.get('/api/items', (req, res) => {
  res.json(readData().items);
});

app.post('/api/items', (req, res) => {
  const { label, type } = req.body;
  if (typeof label !== 'string' || label.trim() === '') {
    return res.status(400).json({ error: 'label is required' });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const data = readData();

  if (type === 'text') {
    const { value } = req.body;
    if (typeof value !== 'string') {
      return res.status(400).json({ error: 'text value must be a string' });
    }
    const item = { id, label: label.trim(), type, value, createdAt };
    data.items.push(item);
    writeData(data);
    return res.json(item);
  }

  if (type === 'image') {
    const { dataUrl } = req.body;
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'dataUrl must be a base64 image data URL' });
    }
    const mime = match[1];
    const ext = EXT_BY_MIME[mime];
    if (!ext) {
      return res.status(400).json({ error: `unsupported image mime type: ${mime}` });
    }
    const filename = `${id}.${ext}`;
    fs.writeFileSync(path.join(IMAGES_DIR, filename), Buffer.from(match[2], 'base64'));
    const item = { id, label: label.trim(), type, filename, mime, createdAt };
    data.items.push(item);
    writeData(data);
    return res.json(item);
  }

  return res.status(400).json({ error: `unknown type: ${type}` });
});

app.delete('/api/items/:id', (req, res) => {
  const data = readData();
  const idx = data.items.findIndex((i) => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'item not found' });
  const [removed] = data.items.splice(idx, 1);
  if (removed.type === 'image') {
    const filepath = path.join(IMAGES_DIR, removed.filename);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
  writeData(data);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`myself app running at http://localhost:${PORT}`);
});
