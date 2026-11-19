/**
 * 参考同步服务器（无第三方依赖）。
 *   node server/sync-server.mjs [端口，默认 8787]
 * 同时提供 dist/ 静态文件，并在 /api 下提供同步接口。数据保存在 server/data.json。
 * 版本冲突时返回服务器副本，由客户端提示人工核对，不静默覆盖。
 * 仅为参考实现：正式部署请加上身份认证与 HTTPS。
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, 'data.json');
const DIST = join(here, '..', 'dist');
const PORT = Number(process.argv[2] || process.env.PORT || 8787);

let db = existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : { items: {} };
const save = () => writeFileSync(DATA, JSON.stringify(db, null, 1));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, {
    'Content-Type': type, 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/api/pull' && req.method === 'GET') {
    return send(res, 200, { items: Object.entries(db.items).map(([key, v]) => ({ key, version: v.version, data: v.data })) });
  }
  if (url.pathname === '/api/push' && req.method === 'POST') {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      try {
        const { changes } = JSON.parse(buf);
        const results = changes.map((c) => {
          const cur = db.items[c.key];
          const curV = cur ? cur.version : 0;
          if (c.baseVersion !== curV) return { key: c.key, conflict: true, server: { version: curV, data: cur ? cur.data : null } };
          db.items[c.key] = { version: curV + 1, data: c.data, updatedAt: new Date().toISOString() };
          return { key: c.key, ok: true, version: curV + 1 };
        });
        save();
        send(res, 200, { results });
      } catch (e) {
        send(res, 400, { error: String(e) });
      }
    });
    return;
  }
  // 静态文件（单页应用）
  let p = normalize(join(DIST, decodeURIComponent(url.pathname)));
  if (!p.startsWith(DIST)) return send(res, 403, 'forbidden', 'text/plain');
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html');
  if (!existsSync(p)) return send(res, 404, '请先运行 npm run build', 'text/plain; charset=utf-8');
  send(res, 200, readFileSync(p), TYPES[extname(p)] || 'application/octet-stream');
}).listen(PORT, () => console.log(`同步服务器：http://localhost:${PORT}  （同步地址填 /api 或 http://localhost:${PORT}/api）`));
