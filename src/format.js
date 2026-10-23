import { ScanError } from './ranking.js';
import { slackErrorCode } from './api.js';

const number = value => value.toLocaleString('ja-JP');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function formatRanking(result) {
  const reaction = result.reaction ?? '+1';
  const rows = result.top.map((row, i) => `${i + 1}位 ${escape(row.displayName ?? '名前未設定')}　*${number(row.count)}個*`);
  return [
    `*受け取った${reaction === '+1' ? 'いいね' : ''}:${escape(reaction)}: Top 10*`,
    rows.length ? rows.join('\n') : '対象のリアクションはありませんでした。',
  ].join('\n');
}

export function formatFailure(error) {
  const prefix = '集計を完了できなかったため、Top 10は表示しません。\n';
  if (error instanceof ScanError) {
    if (error.code === 'self_unknown') {
      return `${prefix}押した人の一覧がSlack APIで省略され、自分へのリアクションを判定できない投稿がありました。\n推測して引き算することはしていません。現在の公式APIでは、この条件の過去分を必ず正確に復元することはできません。`;
    }
    return prefix + error.message;
  }
  const code = slackErrorCode(error);
  const advice = {
    missing_scope: 'アプリの権限を確認してワークスペースに再インストールしてください。',
    not_in_channel: 'Botを対象チャンネルへ招待してください。',
    not_allowed_token_type: '履歴・スレッド取得にこのトークンを利用できません。管理者に利用可能な権限を確認してください。',
    channel_not_found: 'チャンネルへのアクセス権を確認してください。',
    invalid_auth: 'Botトークンを確認してください。',
    token_revoked: 'Botトークンが失効しています。再インストールして設定してください。',
    message_not_found: '取得中に投稿が削除された可能性があります。もう一度実行してください。',
    thread_not_found: 'スレッドを取得できませんでした。もう一度実行してください。',
  }[code] ?? 'Slackとの接続・権限を確認して再実行してください。';
  return `${prefix}Slack API: ${code}\n${advice}`;
}

export function formatProgress(progress) {
  if (!progress) return 'チャンネルを確認中です。';
  return `${progress.phase}：チャンネル ${progress.channelsDone}/${progress.channelsTotal}件、投稿 ${number(progress.messages)}件、スレッド ${number(progress.threads)}件。`;
}
