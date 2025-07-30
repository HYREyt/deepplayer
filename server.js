import express from 'express';
import WebTorrent from 'webtorrent';
import fetch from 'node-fetch';  // npm i node-fetch@2
import path from 'path';
import { fileURLToPath } from 'url';

// Helpers para __dirname no ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const client = new WebTorrent();
const torrents = new Map();

// Servir frontend estático (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// Rota para buscar JSON da API Torrentio e repassar
app.get('/api/torrentio', async (req, res) => {
  const { type, id } = req.query;
  if (!type || !id) return res.status(400).json({ error: 'Missing type or id' });

  try {
    const url = `https://torrentio.strem.fun/stream/${type}/${id}.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch from Torrentio');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rota para streaming de torrent via infoHash e fileIdx
app.get('/stream/:infoHash', (req, res) => {
  const { infoHash } = req.params;
  const fileIdx = parseInt(req.query.fileIdx) || 0;

  function streamTorrent(torrent) {
    if (fileIdx >= torrent.files.length) {
      return res.status(404).send('File index out of range');
    }

    const file = torrent.files[fileIdx];
    const range = req.headers.range;

    if (!range) {
      res.writeHead(200, {
        'Content-Length': file.length,
        'Content-Type': 'video/mp4',
      });
      file.createReadStream().pipe(res);
    } else {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : file.length - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });

      file.createReadStream({ start, end }).pipe(res);
    }
  }

  if (torrents.has(infoHash)) {
    const torrent = torrents.get(infoHash);
    if (torrent.ready) {
      streamTorrent(torrent);
    } else {
      torrent.once('ready', () => {
        streamTorrent(torrent);
      });
    }
  } else {
    client.add(infoHash, (torrent) => {
      torrents.set(infoHash, torrent);
      torrent.once('ready', () => {
        streamTorrent(torrent);
      });
    });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
