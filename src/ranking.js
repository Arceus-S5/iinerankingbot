export const isThumbsUp = name => /^(?:\+1|thumbsup)(?:::skin-tone-[2-6])?$/.test(name ?? '');
export const rankingRequest = /^\s*全体の(.+?)(?:の)?ランキングを見せて[。！!]?\s*$/u;

export function parseReactionRequest(text) {
  const value = rankingRequest.exec(text)?.[1]?.trim();
  if (!value) return null;
  if (value === 'いいね' || value === '👍') return '+1';
  const unicode = { '🙂': 'slightly_smiling_face', '❤️': 'heart', '❤': 'heart', '😀': 'grinning' };
  if (unicode[value]) return unicode[value];
  const name = /^:([^:\s]+(?:::skin-tone-[2-6])?):$/u.exec(value)?.[1];
  return name === 'thumbsup' ? '+1' : name ?? null;
}

export function matchesReaction(name, target) {
  if (target === '+1' || target === 'thumbsup') return isThumbsUp(name);
  return name === target || (!target.includes('::skin-tone-') && name?.startsWith(`${target}::skin-tone-`));
}

export class ScanError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    this.details = details;
  }
}

const userMessageSubtypes = new Set([undefined, 'file_share', 'me_message', 'thread_broadcast', 'reply_broadcast']);

export function isUserMessage(message) {
  return message?.type === 'message' && typeof message.user === 'string'
    && !message.bot_id && userMessageSubtypes.has(message.subtype);
}

export function countLikes(message, { excludeSelf = true, reaction: targetReaction = '+1' } = {}) {
  let total = 0;
  for (const reaction of message.reactions ?? []) {
    if (!matchesReaction(reaction.name, targetReaction)) continue;
    const count = reaction.count;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new ScanError('invalid_count', 'Slackから有効なリアクションの件数を取得できませんでした。');
    }
    if (!excludeSelf || count === 0) {
      total += count;
      continue;
    }
    const users = new Set(reaction.users ?? []);
    if (users.size > count) throw new ScanError('invalid_count', 'リアクションの件数とユーザー一覧が一致しません。');
    if (users.has(message.user)) {
      total += count - 1;
    } else if (users.size === count) {
      total += count;
    } else {
      // An absent author in a truncated users array is NOT proof of no self-like.
      throw new ScanError('self_unknown', '自分で押したリアクションを除外できるだけの情報がSlackから返されませんでした。');
    }
  }
  return total;
}

export function topTen(totals) {
  return [...totals].map(([userId, count]) => ({ userId, count }))
    .filter(row => row.count > 0)
    .sort((a, b) => b.count - a.count || a.userId.localeCompare(b.userId, 'en'))
    .slice(0, 10);
}
