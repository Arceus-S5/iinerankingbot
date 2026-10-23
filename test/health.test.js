import test from 'node:test';
import assert from 'node:assert/strict';
import { startHealthServer } from '../src/health.js';

test('health endpoint responds without exposing Slack data or offering actions', async t => {
  const server = await startHealthServer(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${url}/healthz`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok\n');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${url}/`)).status, 404);
  assert.equal((await fetch(`${url}/healthz`, { method: 'POST' })).status, 404);
});
