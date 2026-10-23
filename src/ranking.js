export const isThumbsUp = name => /^(?:\+1|thumbsup)(?:::skin-tone-[2-6])?$/.test(name ?? '');
export const rankingRequest = /^\s*全体のいいねランキングを見せて[。！!]?\s*$/u;

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

export function countLikes(message, { excludeSelf = true } = {}) {
  let total = 0;
  for (const reaction of message.reactions ?? []) {
    if (!isThumbsUp(reaction.name)) continue;
    const count = reaction.count;
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new ScanError('invalid_count', 'Slackから有効な👍の件数を取得できませんでした。');
    }
    if (!excludeSelf || count === 0) {
      total += count;
      continue;
    }
    const users = new Set(reaction.users ?? []);
    if (users.size > count) throw new ScanError('invalid_count', '👍の件数とユーザー一覧が一致しません。');
    if (users.has(message.user)) {
      total += count - 1;
    } else if (users.size === count) {
      total += count;
    } else {
      // An absent author in a truncated users array is NOT proof of no self-like.
      throw new ScanError('self_unknown', '自分で押した👍を除外できるだけの情報がSlackから返されませんでした。');
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
