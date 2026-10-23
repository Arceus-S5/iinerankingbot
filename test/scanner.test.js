import test from 'node:test';
import assert from 'node:assert/strict';
import { scanWorkspace } from '../src/scanner.js';
import { formatFailure, formatRanking } from '../src/format.js';

const stamp = '2026-10-23T13:30:00.000Z';
const options = { now: () => new Date(stamp) };
const channel = { id: 'CONE', name: 'one', is_member: true, is_private: false };
const msg = (ts, user, count, others = {}) => ({ type: 'message', ts, user, reactions: [{ name: '+1', count, users: Array.from({ length: count }, (_, i) => `ULIKER${i}`) }], ...others });

test('scan every channel/history/reply page; replace parents and broadcasts instead of double-counting', async () => {
  const requests = [];
  const call = async (method, args) => {
    requests.push({ method, args });
    if (method === 'conversations.list') {
      return !args.cursor
        ? { ok: true, channels: [channel], response_metadata: { next_cursor: 'channels-2' } }
        : { ok: true, channels: [{ ...channel, id: 'CTWO', is_private: true, is_archived: true }] };
    }
    if (args.channel === 'CTWO') return { ok: true, messages: [msg('5.000000', 'UB', 1)] };
    if (method === 'conversations.history') {
      return !args.cursor ? {
        ok: true, messages: [msg('1.000000', 'UA', 1, { reply_count: 2 }), msg('3.000000', 'UB', 2, { thread_ts: '1.000000', subtype: 'thread_broadcast' })],
        has_more: true, response_metadata: { next_cursor: 'history-2' },
      } : {
        ok: true, messages: [
          msg('4.000000', 'BOT', 100, { bot_id: 'BONE', subtype: 'bot_message' }),
          msg('1799999999.000000', 'UFUTURE', 100),
        ],
      };
    }
    if (method === 'conversations.replies') {
      return !args.cursor ? {
        ok: true, messages: [msg('1.000000', 'UA', 2), msg('2.000000', 'UB', 3, { thread_ts: '1.000000' })],
        has_more: true, response_metadata: { next_cursor: 'replies-2' },
      } : { ok: true, messages: [msg('3.000000', 'UB', 2, { thread_ts: '1.000000' })] };
    }
    throw new Error(`Unexpected ${method}`);
  };
  const result = await scanWorkspace(call, options);
  assert.deepEqual(result.top, [{ userId: 'UB', count: 6 }, { userId: 'UA', count: 2 }]);
  assert.equal(result.messages, 4);
  assert.equal(result.totalLikes, 8);
  assert.equal(result.channels.length, 2);
  assert.equal(result.channels[1].archived, true);
  assert.equal(requests.filter(r => r.method === 'conversations.replies').length, 2);
  for (const { method, args } of requests) {
    if (method === 'conversations.list') assert.equal(args.exclude_archived, false);
    else assert.ok(args.latest && args.inclusive);
  }
  assert.match(formatRanking(result), /<@UB>.*6/);
  assert.equal(formatRanking(result), '*受け取ったいいね Top 10*\n1. <@UB>　*6* 👍\n2. <@UA>　*2* 👍');
});

test('skip unjoined channels and rank only joined channels', async () => {
  const result = await scanWorkspace(async (method, args) => {
    if (method === 'conversations.list') return { ok: true, channels: [channel, { ...channel, id: 'CSKIP', is_member: false }] };
    assert.equal(args.channel, 'CONE');
    return { ok: true, messages: [msg('1.000000', 'UA', 3)] };
  }, options);
  assert.equal(result.skippedChannels, 1);
  assert.equal(result.channels.length, 1);
  assert.deepEqual(result.top, [{ userId: 'UA', count: 3 }]);
  assert.equal(formatRanking(result), '*受け取ったいいね Top 10*\n1. <@UA>　*3* 👍');
});

test('report no accessible channels when the bot has joined none', async () => {
  await assert.rejects(scanWorkspace(async () => ({ ok: true, channels: [{ ...channel, is_member: false }] }), options), { code: 'no_channels' });
});

test('retry ambiguous self-likes with reactions.get(full=true)', async () => {
  const message = msg('1.000000', 'UA', 3, { reactions: [{ name: '+1', count: 3, users: ['UB'] }] });
  const result = await scanWorkspace(async (method, args) => {
    if (method === 'conversations.list') return { ok: true, channels: [channel] };
    if (method === 'conversations.history') return { ok: true, messages: [message] };
    assert.equal(method, 'reactions.get');
    assert.equal(args.full, true);
    return { ok: true, type: 'message', message: { ...message, reactions: [{ name: '+1', count: 3, users: ['UA'] }] } };
  }, options);
  assert.deepEqual(result.top, [{ userId: 'UA', count: 2 }]);
});

test('if a full retry still omits the author, fail instead of publishing plausible totals', async () => {
  const message = msg('1.000000', 'UA', 3, { reactions: [{ name: '+1', count: 3, users: ['UB'] }] });
  await assert.rejects(scanWorkspace(async method => {
    if (method === 'conversations.list') return { ok: true, channels: [channel] };
    if (method === 'conversations.history') return { ok: true, messages: [message] };
    return { ok: true, type: 'message', message };
  }, options), error => {
    assert.equal(error.code, 'self_unknown');
    assert.match(formatFailure(error), /Top 10は表示しません/);
    return true;
  });
});

test('an API failure in a thread aborts the whole workspace scan', async () => {
  const failure = Object.assign(new Error('Slack failed'), { data: { error: 'missing_scope' } });
  await assert.rejects(scanWorkspace(async method => {
    if (method === 'conversations.list') return { ok: true, channels: [channel] };
    if (method === 'conversations.history') return { ok: true, messages: [msg('1.000000', 'UA', 1, { reply_count: 1 })] };
    throw failure;
  }, options), error => error === failure);
});

test('a missing cursor or repeated cursor cannot silently truncate pagination', async () => {
  await assert.rejects(scanWorkspace(async () => ({ ok: true, channels: [channel], has_more: true }), options), { code: 'pagination_incomplete' });
  await assert.rejects(scanWorkspace(async () => ({ ok: true, channels: [channel], response_metadata: { next_cursor: 'same' } }), options), { code: 'pagination_loop' });
});

test('known history limits and absent channel membership metadata are errors', async () => {
  await assert.rejects(scanWorkspace(async () => ({ ok: true, channels: [channel], is_limited: true }), options), { code: 'history_limited' });
  await assert.rejects(scanWorkspace(async () => ({ ok: true, channels: [{ id: 'CONE' }] }), options), { code: 'invalid_channel' });
});

test('no-self-exclusion mode uses complete counts even when users are truncated', async () => {
  const result = await scanWorkspace(async method => method === 'conversations.list'
    ? { ok: true, channels: [channel] }
    : { ok: true, messages: [msg('1.000000', 'UA', 50, { reactions: [{ name: '+1', count: 50, users: [] }] })] },
  { ...options, excludeSelf: false });
  assert.equal(result.top[0].count, 50);
});
