const express = require('express');
const fetch = require('node-fetch');

const app = express();

// ★ ここにデプロイしたGitHub用WorkerのURLを入れる
const CF_WORKER_URL = "https://mygithub.shunichi-0314.workers.dev";

app.use(express.raw({ type: '*/*', limit: '50mb' }));

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'
]);

app.all('*', async (req, res) => {
  try {
    const targetUrl = CF_WORKER_URL + req.originalUrl;

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(key.toLowerCase()) && value) {
        headers[key] = value;
      }
    }

    // WorkerにRenderのドメインを伝える（重要）
    headers['X-Forwarded-Host'] = req.get('host');
    headers['X-Forwarded-Proto'] = 'https';
    headers['X-Forwarded-For'] = req.ip;
    headers['Accept-Encoding'] = 'gzip, deflate, br';

    const fetchOptions = {
      method: req.method,
      headers,
      timeout: 60000,
      compress: true,
      redirect: 'manual',
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body
    };

    const response = await fetch(targetUrl, fetchOptions);

    // リダイレクト対応
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (location) {
        // Worker側で既に書き換えられている想定だが、念のため
        return res.redirect(response.status, location);
      }
    }

    // レスポンスヘッダー転送
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (
        HOP_BY_HOP.has(lowerKey) ||
        lowerKey === 'content-encoding' ||
        lowerKey === 'content-length' ||
        lowerKey === 'transfer-encoding'
      ) {
        return;
      }
      res.set(key, value);
    });

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', '*');

    const buffer = await response.buffer();
    res.status(response.status).send(buffer);

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(500).send('読み込みに失敗しました。Workers側を確認してください。\n' + error.message);
  }
});

app.options('*', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', '*');
  res.status(204).end();
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`GitHub Proxy running on port ${port}`);
});
