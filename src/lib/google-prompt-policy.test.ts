import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldPromptGoogleOneTap } from './google-prompt-policy.ts';

test('localhost 环境不应自动弹出 Google One Tap', () => {
	assert.equal(shouldPromptGoogleOneTap('http://localhost:3000/02'), false);
	assert.equal(shouldPromptGoogleOneTap('http://127.0.0.1:4321/user/login'), false);
});

test('正式域名可允许自动弹出 Google One Tap', () => {
	assert.equal(shouldPromptGoogleOneTap('https://food.serbia70.com/02'), true);
});
