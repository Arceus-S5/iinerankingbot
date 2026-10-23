import test from 'node:test';
import assert from 'node:assert/strict';
import { countLikes, isThumbsUp, rankingRequest, topTen } from '../src/ranking.js';

test('the requested Japanese message triggers the ranking', () => {
  for (const text of ['全体のいいねランキングを見せて', ' 全体のいいねランキングを見せて！\n']) {
    assert.ok(rankingRequest.test(text));
  }
  for (const text of ['全体のいいねランキングを見せてと言ってみた', 'いいねいくつ']) {
    assert.equal(rankingRequest.test(text), false);
  }
});

test('count thumbs-up and tone variants only; exclude self per reaction', () => {
  assert.equal(countLikes({ user: 'UA', reactions: [
    { name: '+1', count: 3, users: ['UA', 'UB', 'UC'] },
    { name: '+1::skin-tone-3', count: 2, users: ['UB', 'UC'] },
    { name: 'thumbsup', count: 1, users: ['UB'] },
    { name: 'heart', count: 100, users: [] },
    { name: 'custom_+1', count: 100, users: [] },
  ] }), 5);
  assert.equal(isThumbsUp('thumbsup::skin-tone-6'), true);
  assert.equal(isThumbsUp('not+1'), false);
});

test('a truncated users array is usable when the author is present', () => {
  assert.equal(countLikes({ user: 'UA', reactions: [{ name: '+1', count: 50, users: ['UA'] }] }), 49);
});

test('do not guess self-likes when the author is absent from a truncated list', () => {
  assert.throws(() => countLikes({ user: 'UA', reactions: [{ name: '+1', count: 50, users: ['UB'] }] }), { code: 'self_unknown' });
});

test('the count, not users.length, is used when including self', () => {
  assert.equal(countLikes({ user: 'UA', reactions: [{ name: '+1', count: 50, users: ['UB'] }] }, { excludeSelf: false }), 50);
});

test('empty reactions are zero; invalid counts stop the scan', () => {
  assert.equal(countLikes({ user: 'UA' }), 0);
  assert.throws(() => countLikes({ user: 'UA', reactions: [{ name: '+1', count: -1 }] }), { code: 'invalid_count' });
});

test('return at most ten people, descending by count, with stable ties', () => {
  const totals = new Map(Array.from({ length: 12 }, (_, i) => [`U${String(i).padStart(2, '0')}`, i]));
  totals.set('UA', 11);
  const top = topTen(totals);
  assert.equal(top.length, 10);
  assert.deepEqual(top.slice(0, 2), [{ userId: 'U11', count: 11 }, { userId: 'UA', count: 11 }]);
  assert.equal(top.at(-1).count, 3);
});
