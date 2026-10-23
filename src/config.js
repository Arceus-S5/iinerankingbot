export function loadConfig(env = process.env) {
  const botToken = env.SLACK_BOT_TOKEN?.trim();
  const appToken = env.SLACK_APP_TOKEN?.trim();
  if (!botToken?.startsWith('xoxb-') || botToken.includes('your-')) {
    throw new Error('.env の SLACK_BOT_TOKEN に実際の xoxb- トークンを設定してください。');
  }
  if (!appToken?.startsWith('xapp-') || appToken.includes('your-')) {
    throw new Error('.env の SLACK_APP_TOKEN に実際の xapp- トークンを設定してください。');
  }
  const allowedUserIds = new Set((env.SLACK_ALLOWED_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean));
  if (!allowedUserIds.size || [...allowedUserIds].some(id => id !== '*' && !/^[UW][A-Z0-9]+$/.test(id))) {
    throw new Error('SLACK_ALLOWED_USER_IDS に *（全員）または利用者のメンバーIDを設定してください。');
  }
  function boolean(name, fallback) {
    const value = env[name]?.trim();
    if (value === undefined || value === '') return fallback;
    if (value !== 'true' && value !== 'false') throw new Error(`${name} は true / false で設定してください。`);
    return value === 'true';
  }
  return {
    botToken, appToken, allowedUserIds,
    excludeSelf: boolean('EXCLUDE_SELF_LIKES', true),
    includePrivate: boolean('INCLUDE_PRIVATE_CHANNELS', true),
  };
}

export function canUseBot(config, userId) {
  return config.allowedUserIds.has('*') || config.allowedUserIds.has(userId);
}
