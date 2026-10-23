// 自分のRender URLに変更して、Google Apps Scriptに貼り付けてください。
const HEALTH_URL = 'https://YOUR-SERVICE.onrender.com/healthz';

function pingBot() {
  if (HEALTH_URL.includes('YOUR-SERVICE')) throw new Error('RenderのURLを設定してください。');
  const response = UrlFetchApp.fetch(HEALTH_URL, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200 || response.getContentText().trim() !== 'ok') {
    throw new Error('Botのヘルスチェックに失敗しました。HTTP ' + response.getResponseCode());
  }
}

// 一度実行して権限を許可します。再実行してもトリガーは重複しません。
function setupKeepalive() {
  pingBot();
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'pingBot') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('pingBot').timeBased().everyMinutes(5).create();
}
