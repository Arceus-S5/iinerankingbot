export async function addDisplayNames(call, rows) {
  const result = [];
  for (const row of rows) {
    const response = await call('users.info', { user: row.userId });
    if (!response.user) throw new Error('Slackの表示名を取得できませんでした。');
    const user = response.user;
    const displayName = [user.profile?.display_name, user.profile?.real_name, user.real_name, user.name]
      .find(value => typeof value === 'string' && value.trim())?.trim() ?? '名前未設定';
    result.push({ ...row, displayName });
  }
  return result;
}
