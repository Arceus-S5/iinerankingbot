import { ScanError } from './ranking.js';
import { slackErrorCode } from './api.js';

const number = value => value.toLocaleString('ja-JP');
const date = value => new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
}).format(new Date(value));

export function formatRanking(result) {
  const rows = result.top.map((row, i) => `${i + 1}. <@${row.userId}>　*${number(row.count)}* 👍`);
  return [
    '*👍 受け取ったいいね Top 10*',
    rows.length ? rows.join('\n') : '対象の投稿に👍はありませんでした。',
    '',
    `集計対象：Botが参照できる${result.includePrivate ? '公開・非公開' : '公開'}チャンネル ${number(result.channels.length)}件（アーカイブ含む・DM除外）`,
    `確認した投稿：${number(result.messages)}件／👍合計：${number(result.totalLikes)}`,
    `自分で押した👍：${result.excludeSelf ? '除外' : '含む'}／肌色違いを含む👍の表示件数を合計`,
    `取得：${date(result.startedAt)} 〜 ${date(result.completedAt)} JST`,
    '開始時刻以前の投稿に、取得中の各時点で付いていた👍を集計。同数はメンバーID順で最大10人。',
    'Botに見えない非公開チャンネル・削除済み／保存期間外の投稿は含みません。ワークスペースの全投稿や同一瞬間の総数を保証する結果ではありません。',
  ].join('\n');
}

export function formatFailure(error) {
  const prefix = '集計を完了できなかったため、Top 10は表示しません。\n';
  if (error instanceof ScanError) {
    if (error.code === 'missing_channels') {
      const ids = error.details.channelIds.slice(0, 8).map(id => `<#${id}>`).join('、');
      return `${prefix}Bot未参加のチャンネルが${error.details.count}件あります：${ids}\n対象すべてにBotを招待してから再実行してください。アーカイブ済みチャンネルは管理者に参加方法を確認してください。`;
    }
    if (error.code === 'self_unknown') {
      return `${prefix}押した人の一覧がSlack APIで省略され、自分への👍を判定できない投稿がありました。\n推測して引き算することはしていません。現在の公式APIでは、この条件の過去分を必ず正確に復元することはできません。`;
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
