import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, canUseBot } from '../src/config.js';

const env = { SLACK_BOT_TOKEN: 'xoxb-test', SLACK_APP_TOKEN: 'xapp-test' };

test('wildcard lets any Slack member use both request paths', () => {
  const config = loadConfig({ ...env, SLACK_ALLOWED_USER_IDS: '*' });
  assert.equal(canUseBot(config, 'UONE'), true);
  assert.equal(canUseBot(config, 'UTWO'), true);
});

test('explicit member restrictions continue to apply', () => {
  const config = loadConfig({ ...env, SLACK_ALLOWED_USER_IDS: 'UONE, UTWO' });
  assert.equal(canUseBot(config, 'UONE'), true);
  assert.equal(canUseBot(config, 'UTHREE'), false);
  assert.throws(() => loadConfig({ ...env, SLACK_ALLOWED_USER_IDS: '' }));
});
