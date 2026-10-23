import { ScanError, countLikes, isUserMessage, topTen } from './ranking.js';

async function* pages(call, method, args, key) {
  let cursor;
  const seen = new Set();
  do {
    const response = await call(method, { ...args, ...(cursor ? { cursor } : {}) });
    if (response.has_more === true && !response.response_metadata?.next_cursor?.trim()) {
      throw new ScanError('pagination_incomplete', 'Slackのページ取得が途中で止まりました。');
    }
    if (response.is_limited === true) {
      throw new ScanError('history_limited', 'Slackの履歴制限を検出しました。全履歴の集計として表示できません。');
    }
    if (!Array.isArray(response[key])) {
      throw new ScanError('invalid_response', 'Slackの取得結果に必要な一覧がありません。');
    }
    yield response[key];
    cursor = response.response_metadata?.next_cursor?.trim();
    if (cursor && seen.has(cursor)) throw new ScanError('pagination_loop', 'Slackのページ取得が繰り返されました。');
    if (cursor) seen.add(cursor);
  } while (cursor);
}

export async function scanWorkspace(call, {
  excludeSelf = true, includePrivate = true, onProgress = () => {}, now = () => new Date(),
} = {}) {
  const startedAt = now().toISOString();
  // Bound the set of messages; reaction values are observed during the scan, not an atomic snapshot.
  const cutoff = (new Date(startedAt).getTime() / 1000).toFixed(6);
  const channels = [];
  for await (const batch of pages(call, 'conversations.list', {
    types: includePrivate ? 'public_channel,private_channel' : 'public_channel',
    exclude_archived: false, limit: 200,
  }, 'channels')) {
    for (const channel of batch) {
      if (!channel.id || typeof channel.is_member !== 'boolean') {
        throw new ScanError('invalid_channel', 'チャンネルへのBotの参加状態を確認できません。');
      }
      channels.push(channel);
    }
  }
  const visibleChannels = [...new Map(channels.map(c => [c.id, c])).values()];
  const skippedChannels = visibleChannels.filter(c => !c.is_member).length;
  const uniqueChannels = visibleChannels.filter(c => c.is_member);
  if (!uniqueChannels.length) throw new ScanError('no_channels', '集計できるチャンネルがありません。Botを招待してください。');

  const totals = new Map();
  const progress = { channelsDone: 0, channelsTotal: uniqueChannels.length, messages: 0, threads: 0, phase: '履歴を取得中' };
  const publish = () => onProgress({ ...progress });
  publish();

  for (const channel of uniqueChannels) {
    const messages = new Map();
    const threads = new Set();
    function remember(message) {
      if (typeof message.ts !== 'string' || !/^\d+\.\d+$/.test(message.ts)) {
        throw new ScanError('invalid_message', '投稿の識別子を取得できませんでした。');
      }
      if (Number(message.ts) > Number(cutoff)) return;
      // Keep only the metadata needed for counts; do not retain message text or files.
      messages.set(message.ts, {
        type: message.type, user: message.user, bot_id: message.bot_id,
        subtype: message.subtype, ts: message.ts, reactions: message.reactions,
      });
      if ((message.reply_count > 0 || message.thread_ts === message.ts) && message.subtype !== 'channel_join' && message.subtype !== 'channel_leave') {
        threads.add(message.ts);
      }
      if (message.thread_ts && message.thread_ts !== message.ts) threads.add(message.thread_ts);
    }
    for await (const batch of pages(call, 'conversations.history', {
      channel: channel.id, limit: 200, latest: cutoff, inclusive: true,
    }, 'messages')) {
      batch.forEach(remember);
      progress.messages = [...messages.values()].filter(isUserMessage).length + (progress.finishedMessages ?? 0);
      publish();
    }
    // replies also returns the parent; replacing by ts prevents double counting broadcasts/parents.
    // Snapshot this set to avoid newly observed reply metadata changing the iteration.
    for (const ts of [...threads]) {
      for await (const batch of pages(call, 'conversations.replies', {
        channel: channel.id, ts, limit: 200, latest: cutoff, inclusive: true,
      }, 'messages')) {
        batch.forEach(remember);
        progress.messages = [...messages.values()].filter(isUserMessage).length + (progress.finishedMessages ?? 0);
        publish();
      }
      progress.threads += 1;
    }
    for (let message of messages.values()) {
      if (!isUserMessage(message)) continue;
      let count;
      try {
        count = countLikes(message, { excludeSelf });
      } catch (error) {
        if (error.code !== 'self_unknown') throw error;
        progress.phase = '自分の👍を再確認中';
        publish();
        const response = await call('reactions.get', { channel: channel.id, timestamp: message.ts, full: true });
        if (response.type !== 'message' || response.message?.ts !== message.ts || response.message?.user !== message.user) {
          throw new ScanError('invalid_response', '👍の再取得結果を元の投稿と照合できませんでした。');
        }
        message = response.message;
        try {
          count = countLikes(message, { excludeSelf });
        } catch (retryError) {
          if (retryError.code === 'self_unknown') {
            throw new ScanError('self_unknown', retryError.message, { channelId: channel.id, ts: message.ts });
          }
          throw retryError;
        }
      }
      totals.set(message.user, (totals.get(message.user) ?? 0) + count);
    }
    progress.finishedMessages = (progress.finishedMessages ?? 0) + [...messages.values()].filter(isUserMessage).length;
    progress.messages = progress.finishedMessages;
    progress.channelsDone += 1;
    progress.phase = '履歴を取得中';
    publish();
  }
  return {
    top: topTen(totals), totalLikes: [...totals.values()].reduce((a, b) => a + b, 0),
    startedAt, completedAt: now().toISOString(), cutoff,
    channels: uniqueChannels.map(c => ({ id: c.id, isPrivate: !!c.is_private, archived: !!c.is_archived })),
    messages: progress.messages, threads: progress.threads, excludeSelf, includePrivate, skippedChannels,
  };
}
