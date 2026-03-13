import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUserAddressPayload, parseUserAddress } from './user-address-state.ts';

test('可解析 JSON 地址结构', () => {
	assert.deepEqual(
		parseUserAddress('{"name":"hui","phone":"0613083888","address":"ruma1"}'),
		{ name: 'hui', phone: '0613083888', detail: 'ruma1' },
	);
});

test('旧字符串地址回退到 detail', () => {
	assert.deepEqual(parseUserAddress('veljka dugosevica 197'), {
		name: '',
		phone: '',
		detail: 'veljka dugosevica 197',
	});
});

test('可构建地址更新 payload', () => {
	assert.equal(
		buildUserAddressPayload('hui', '0613083888', 'ruma1'),
		'{"name":"hui","phone":"0613083888","address":"ruma1"}',
	);
});
