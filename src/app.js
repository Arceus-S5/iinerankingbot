import bolt from '@slack/bolt';
import { loadConfig, canUseBot } from './config.js';
import { createApi, slackErrorCode } from './api.js';
import { scanWorkspace } from './scanner.js';
import { formatFailure, formatProgress, formatRanking } from './format.js';
import { rankingRequest } from './ranking.js';
import { startHealthServer } from './health.js';

const { App, LogLevel } = bolt;
let config;
try {
  config = loadConfig();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
// Bolt handles Slack events; the optional HTTP server only serves process health.
const app = new App({
  token: config.botToken, appToken: config.appToken, socketMode: true,
  logLevel: LogLevel.ERROR,
  clientOptions: { retryConfig: { retries: 3 } },
});
const call = createApi(app.client);
let running;
let stopping = false;
let healthServer;

async function runRanking({ userId, channelId, announce, reply, preflightReply = reply }) {
  if (!canUseBot(config, userId)) {
    await announce('このBotの利用者に登録されていません。管理者に確認してください。');
    return;
  }
  if (running || stopping) {
    await announce(stopping ? 'Botを停止中です。' : `集計中です。${formatProgress(running.progress)}`);
    return;
  }
  // Reserve the job before yielding to prevent simultaneous scans.
  const job = { progress: undefined };
  running = job;
  try {
    await announce('👍の集計を始めます。完了後、このチャンネルの全員にTop 10を表示します。');
    // Verify delivery is possible before doing a long scan (no response_url timeout dependency).
    const destination = await call('conversations.info', { channel: channelId });
    if (!destination.channel?.is_member) {
      await preflightReply('結果を表示するため、このチャンネルにBotを招待してから再実行してください。');
      return;
    }
    const result = await scanWorkspace(call, {
      excludeSelf: config.excludeSelf, includePrivate: config.includePrivate,
      onProgress: progress => { job.progress = progress; },
    });
    await app.client.chat.postMessage({
      channel: channelId, text: formatRanking(result), unfurl_links: false, unfurl_media: false,
    });
    console.log(`集計完了：${result.channels.length}チャンネル、${result.messages}投稿。`);
  } catch (error) {
    // Do not log raw Slack payloads, response URLs, tokens, or message bodies.
    console.error(`集計失敗：${error.code === 'slack_webapi_platform_error' ? slackErrorCode(error) : (error instanceof Error && error.name === 'ScanError' ? error.code : 'api_error')}`);
    try {
      await reply(formatFailure(error));
    } catch {
      console.error('結果をSlackへ送信できませんでした。接続とチャンネルへの参加状態を確認してください。');
    }
  } finally {
    if (running === job) running = undefined;
  }
}

function ephemeralReply(channel, user, threadTs) {
  return text => app.client.chat.postEphemeral({
    channel, user, text, ...(threadTs ? { thread_ts: threadTs } : {}), link_names: false,
  });
}

// Normal messages are handled by Bolt's message listener, including in threads.
app.message(rankingRequest, async ({ message }) => {
  if (!message.user || message.bot_id || (message.subtype && message.subtype !== 'thread_broadcast')) return;
  const reply = ephemeralReply(message.channel, message.user, message.thread_ts);
  await runRanking({ userId: message.user, channelId: message.channel, announce: reply, reply });
});

// Also keep a slash command for status/help and environments where commands are preferred.
app.command('/like-top', async ({ command, ack, respond }) => {
  const acknowledge = text => ack({ response_type: 'ephemeral', text });
  if (!canUseBot(config, command.user_id)) {
    await acknowledge('このBotの利用者に登録されていません。管理者に確認してください。');
    return;
  }
  const action = command.text.trim();
  if (action === 'help') {
    await acknowledge('「全体のいいねランキングを見せて」で人別Top 10を再集計し、チャンネル全員に表示します。\n/like-top でも開始できます。/like-top status で進行状況を確認できます。');
    return;
  }
  if (action === 'status') {
    await acknowledge(running ? formatProgress(running.progress) : '現在は集計していません。「全体のいいねランキングを見せて」で集計できます。');
    return;
  }
  if (action) {
    await acknowledge('/like-top または /like-top status を使ってください。');
    return;
  }
  await runRanking({
    userId: command.user_id, channelId: command.channel_id, announce: acknowledge,
    reply: ephemeralReply(command.channel_id, command.user_id),
    preflightReply: text => respond({ response_type: 'ephemeral', text }),
  });
});

app.error(async () => { console.error('Slack接続でエラーが発生しました。接続と権限を確認してください。'); });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    stopping = true;
    healthServer?.close();
    await app.stop();
    process.exit(0);
  });
}

try {
  await app.start();
  if (process.env.PORT) {
    healthServer = await startHealthServer(process.env.PORT);
    console.log('ヘルスチェック /healthz を公開しました。');
  }
  console.log('Bolt起動完了。Slackで「全体のいいねランキングを見せて」と送ってください。');
} catch {
  console.error('Slackへ接続できませんでした。トークン、Socket Mode、ネットワークを確認してください。');
  process.exit(1);
}
