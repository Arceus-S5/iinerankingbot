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
   - `SLACK_ALLOWED_USER_IDS`：`*`で全員利用可能。限定する場合はメンバーIDをカンマ区切り
4. 集計したいチャンネルにBotを招待します。未参加のチャンネルは集計から除外します。

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

## Renderで常駐

1. Renderの「New → Web Service」でこのGitHubリポジトリの`main`を選びます。
2. RuntimeはNode、Build Commandは`npm ci --omit=dev`、Start Commandは`npm start`、Instance Typeは**Free**にします。
3. Environmentに`SLACK_BOT_TOKEN`、`SLACK_APP_TOKEN`、`SLACK_ALLOWED_USER_IDS=*`を設定します。`NODE_VERSION=24`も設定してください。`PORT`はRenderが自動設定します。
4. Deploy後、`https://自分のサービス.onrender.com/healthz`で`ok`が返ることを確認します。Health Check Pathも`/healthz`に設定します。
5. [Google Apps Script](https://script.google.com/)で新しいプロジェクトを作り、`gas/keepalive.gs`を貼り付けます。`HEALTH_URL`を自分のURLに変更し、`setupKeepalive`を一度実行して権限を許可します。

GASが5分おきにアクセスします。GAS自体のWebアプリ公開は不要です。停止する場合はGASの「トリガー」から`pingBot`を削除します。

Blueprintを使う場合は`render.yaml`も利用できます。無料枠は月750時間をワークスペース内で共有します。再起動・スリープやGASの実行遅延はあり、完全な無停止は保証されません。`/healthz`はプロセスの応答確認用で、Slack接続や集計の正常性を保証しません。

## 集計範囲

全員利用の場合、Botが取得した非公開チャンネル分を含む合計も各利用者に表示します。公開チャンネルだけに限定する場合は`INCLUDE_PRIVATE_CHANNELS=false`を設定してください。

Botが取得できる公開・非公開チャンネルの履歴とスレッドを集計します。アーカイブ済みチャンネルも対象です。DM、Botに見えない非公開チャンネル、削除済み・保存期間外の投稿は含みません。

未参加のチャンネルはスキップし、参加中のチャンネルだけで順位を表示します。取得エラーや自己いいねの判定不能があれば、ランキングを表示せず停止します。集計中に👍が変わるため、全投稿を同一瞬間に固定した件数ではありません。
