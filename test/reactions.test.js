import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReactionRequest, countLikes } from '../src/ranking.js';
import { formatRanking } from '../src/format.js';
import { addDisplayNames } from '../src/display-names.js';
import { scanWorkspace } from '../src/scanner.js';

test('parse requested reactions, Japanese custom names and legacy command', () => {
  for (const [text, name] of [
    ['全体の:+1:のランキングを見せて', '+1'],
    ['全体の:微笑:のランキングを見せて', '微笑'],
    ['全体の:heart:のランキングを見せて！', 'heart'],
    ['全体の🙂のランキングを見せて', 'slightly_smiling_face'],
    ['全体のいいねランキングを見せて', '+1'],
  ]) assert.equal(parseReactionRequest(text), name);
  assert.equal(parseReactionRequest('全体の何かのランキングを見せて'), null);
});

test('count only the selected custom reaction, excluding self', () => {
  const message = { user: 'UA', reactions: [
    { name: '+1', count: 100, users: [] },
    { name: '微笑', count: 2, users: ['UA', 'UB'] },
  ] };
  assert.equal(countLikes(message, { reaction: '微笑' }), 1);
});

test('selected reaction is used throughout a workspace scan', async () => {
  const result = await scanWorkspace(async method => method === 'conversations.list'
    ? { ok: true, channels: [{ id: 'CONE', is_member: true }] }
    : { ok: true, messages: [{ type: 'message', ts: '1.000001', user: 'UA', reactions: [
      { name: '+1', count: 90, users: [] },
      { name: 'heart', count: 2, users: ['UB', 'UC'] },
    ] }] }, { reaction: 'heart' });
  assert.equal(result.reaction, 'heart');
  assert.deepEqual(result.top, [{ userId: 'UA', count: 2 }]);
});

test('resolve display names and render plain names without mention syntax', async () => {
  const top = await addDisplayNames(async (method, args) => {
    assert.equal(method, 'users.info');
    return { user: args.user === 'UA'
      ? { profile: { display_name: '翠 <@UB>', real_name: 'Real' } }
      : { profile: { display_name: '', real_name: '表示名未設定の人' } } };
  }, [{ userId: 'UA', count: 2 }, { userId: 'UB', count: 1 }]);
  const text = formatRanking({ reaction: '微笑', top });
  assert.equal(text, '*受け取った:微笑: Top 10*\n1位 翠 &lt;@UB&gt;　*2個*\n2位 表示名未設定の人　*1個*');
  assert.equal(text.includes('<@'), false);
});
