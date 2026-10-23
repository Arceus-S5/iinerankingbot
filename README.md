# いいねランキング Bot

受け取ったいいね 👍 の合計で上位10人を表示するSlack Botです。
Bolt for JavaScriptのSocket Modeを使用しています。

## コマンド

| メッセージ・コマンド | 動作 |
| --- | --- |
| 全体のいいねランキングを見せて | 人別のいいね数Top10を表示 |
| `/like-top status` | 集計の進行状況を表示 |

結果は実行した人だけに表示します。自分で押した👍は除外し、肌色違いの👍も集計します。

## 設定

Node.js 22以上が必要です。

1. `manifest.json`からSlackアプリを作成し、ワークスペースにインストールします。
2. Socket Modeを有効にし、`connections:write`付きのApp Tokenを発行します。
3. `.env.example`を`.env`にコピーし、以下を設定します。
   - `SLACK_BOT_TOKEN`：Bot Token（`xoxb-`）
   - `SLACK_APP_TOKEN`：App Token（`xapp-`）
   - `SLACK_ALLOWED_USER_IDS`：利用者のメンバーID（複数の場合はカンマ区切り）
4. 集計対象の全チャンネルにBotを招待します。

## 起動

```sh
npm ci
npm start
```

Slack CLIを使う場合は、`.env`に利用者のメンバーIDを設定して、以下を実行します。認証トークンはCLIから自動で渡されます。アプリの権限・イベント設定はSlackの管理画面で管理します。

```sh
slack login
slack app link --app A0CBQ8FT3ND --team T0CBL7S7MM4 --environment local
slack run --app A0CBQ8FT3ND --team T0CBL7S7MM4
```

`slack run`は実行している端末上で動作します。24時間稼働には常時起動するサーバーが必要です。

## 集計範囲

Botが取得できる公開・非公開チャンネルの履歴とスレッドを集計します。アーカイブ済みチャンネルも対象です。DM、Botに見えない非公開チャンネル、削除済み・保存期間外の投稿は含みません。

未参加の公開チャンネルや取得エラー、自己いいねの判定不能があれば、ランキングを表示せず停止します。集計中に👍が変わるため、全投稿を同一瞬間に固定した件数ではありません。
