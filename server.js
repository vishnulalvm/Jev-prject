// JevTrade server: serves the UI and proxies requests to the TypeSafe Jev API.
// The API key stays on the server. Never put it in the HTML.
// Requires Node 18+ (built-in fetch). No npm packages needed.
//   1. cp .env.example .env   and paste your key into .env
//   2. node server.js
//   3. open http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');

// --- minimal .env loader ---
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.TYPESAFE_API_KEY || '';
const MODEL = process.env.TYPESAFE_MODEL || 'jev-latest';
const API_URL = process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/systemone';
const MAX_BODY = 100 * 1024;          // 100 KB request cap
const MAX_QUESTIONS = 40;             // JevTrade sends at most 21
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MIN || 30);
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

if (!API_KEY) console.warn('TYPESAFE_API_KEY is not set. JevTrade is Jev-API-only and cannot run analyses until it is set.');

// --- per-IP rate limit (in memory) ---
const hits = new Map();
function limited(ip) {
  const now = Date.now(), w = hits.get(ip) || [];
  const recent = w.filter(t => now - t < 60_000);
  recent.push(now); hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function validQuestions(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return false;
  const entries = Object.entries(q);
  if (!entries.length || entries.length > MAX_QUESTIONS) return false;
  return entries.every(([k, v]) => /^[a-z0-9_]{1,64}$/i.test(k) && v && ['noul', 'choice', 'score'].includes(v.type) && v.instructions);
}

// Call TypeSafe with retries on 429 / 529 (exponential backoff).
async function callTypeSafe(payload) {
  let delay = 500;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20_000);
    try {
      const r = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      });
      const text = await r.text();
      if ((r.status === 429 || r.status === 529) && attempt < 2) { await new Promise(s => setTimeout(s, delay)); delay *= 2; continue; }
      return { status: r.status, text };
    } finally { clearTimeout(t); }
  }
}

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/jev/health') {
    return send(res, 200, { ok: Boolean(API_KEY), model: MODEL });
  }

  if (req.method === 'POST' && url.pathname === '/api/jev') {
    if (!API_KEY) return send(res, 503, { error: 'Server has no TYPESAFE_API_KEY' });
    if (limited(ip)) return send(res, 429, { error: 'Too many requests, slow down' });
    try {
      const body = JSON.parse(await readBody(req));
      if (body.state == null || !validQuestions(body.questions)) return send(res, 422, { error: 'Expected { state, questions }' });
      const started = Date.now();
      const out = await callTypeSafe({ state: body.state, model: MODEL, questions: body.questions });
      console.log(`${new Date().toISOString()} jev ${out.status} ${Object.keys(body.questions).length}q ${Date.now() - started}ms`);
      if (out.status >= 400) {
        let msg = `TypeSafe returned ${out.status}`;
        try { const j = JSON.parse(out.text); msg = j.detail ? `${msg}: ${JSON.stringify(j.detail).slice(0, 300)}` : msg; } catch {}
        return send(res, out.status, { error: msg });
      }
      return send(res, 200, out.text);
    } catch (e) {
      const status = e.status || (e.name === 'AbortError' ? 504 : 400);
      return send(res, status, { error: e.name === 'AbortError' ? 'TypeSafe timed out' : 'Bad request' });
    }
  }

  if (req.method === 'GET') {
    // Static files under public/ only (css/js/html). Path-traversal safe: resolve
    // then require the result to still live inside PUBLIC_DIR.
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
    const ext = path.extname(rel);
    if (Object.prototype.hasOwnProperty.call(MIME, ext) || rel === 'index.html') {
      const abs = path.join(PUBLIC_DIR, rel);
      if (abs === PUBLIC_DIR || abs.startsWith(PUBLIC_DIR + path.sep)) {
        try {
          const body = fs.readFileSync(abs, ext === '.js' || ext === '.css' ? 'utf8' : 'utf8');
          return send(res, 200, body, MIME[ext] || 'text/html; charset=utf-8');
        } catch (e) { /* fall through to 404 */ }
      }
    }
  }
  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => console.log(`JevTrade running at http://localhost:${PORT} (model ${MODEL})`));
