import { setTimeout as sleep } from 'node:timers/promises';

// Conservative pacing per method. The Slack SDK additionally honors Retry-After.
export function createApi(client, { intervalMs = 1300, wait = sleep } = {}) {
  const nextCalls = new Map();
  return async (method, args) => {
    const delay = Math.max(0, (nextCalls.get(method) ?? 0) - Date.now());
    if (delay) await wait(delay);
    nextCalls.set(method, Date.now() + intervalMs);
    const response = await client.apiCall(method, args);
    if (!response.ok) throw Object.assign(new Error('Slack API failed'), { data: response });
    return response;
  };
}

export function slackErrorCode(error) {
  const value = error?.data?.error;
  return typeof value === 'string' && /^[a-z_]+$/.test(value) ? value : 'api_error';
}
