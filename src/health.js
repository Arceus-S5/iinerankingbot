import { createServer } from 'node:http';

// Only process health is public. Slack events continue to use Bolt Socket Mode.
export async function startHealthServer(port, host = '0.0.0.0') {
  const value = Number(port);
  if (!Number.isInteger(value) || value < 0 || value > 65535) throw new Error('PORTが不正です。');
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/healthz') {
      res.writeHead(200);
      res.end('ok\n');
    } else {
      res.writeHead(404);
      res.end('not found\n');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(value, host, resolve);
  });
  return server;
}
