import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdminAssignedOrderTelegramMessage,
  buildRiderAwaitingPickupTelegramMessage,
  buildRiderDeliveringTelegramMessage,
  buildRiderDeliveryCompleteTelegramMessage,
  buildRiderPickedUpTelegramMessage,
  buildRiderSingleMessageTelegram,
  buildTelegramEditMessagePayload,
} from './telegram-dispatch.ts';
import {
  findInlineButton,
  flattenInlineButtonTexts,
} from './telegram-dispatch-test-helpers.ts';

test('buildRiderSingleMessageTelegram 输出短动作文案与时间', () => {
  const message = buildRiderSingleMessageTelegram({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    statusLabel: '待取餐',
    acceptedAtLabel: '12:03',
    pickedUpAtLabel: '',
    completedAtLabel: '',
    shopMapUrl: 'https://maps.example.com/shop',
    deliveryMapUrl: 'https://maps.example.com/customer',
    primaryAction: { text: '取餐', callbackData: 'cb-pickup' },
    secondaryAction: null,
  });

  assert.match(message.text, /#A476 · 店铺A/);
  assert.match(message.text, /状态：待取餐/);
  assert.match(message.text, /接单时间：12:03/);
  const pickupButton = findInlineButton(message.replyMarkup.inline_keyboard, '取餐');
  assert.deepEqual(flattenInlineButtonTexts(message.replyMarkup.inline_keyboard), ['取餐', '取餐导航', '送餐导航']);
  assert.equal(pickupButton?.callback_data, 'cb-pickup');
});

test('buildRiderSingleMessageTelegram formats ISO timestamps as Belgrade HH:mm', () => {
  const message = buildRiderSingleMessageTelegram({
    orderNo: 'A477',
    shopName: '店铺B',
    address: 'Test Address',
    phone: '381600000001',
    statusLabel: '已送达',
    acceptedAtLabel: '2026-04-15T13:36:36.723Z',
    pickedUpAtLabel: '2026-04-15T13:46:36.723Z',
    completedAtLabel: '2026-04-15T13:50:40.560Z',
    shopMapUrl: '',
    deliveryMapUrl: '',
    primaryAction: null,
    secondaryAction: null,
  });

  assert.match(message.text, /接单时间：15:36/);
  assert.match(message.text, /取餐时间：15:46/);
  assert.match(message.text, /送达时间：15:50/);
});

test('buildTelegramEditMessagePayload 输出正确 payload', () => {
  const payload = buildTelegramEditMessagePayload({
    chatId: 'chat-1',
    messageId: 7788,
    text: '#A476 · 店铺A\n状态：已送达',
    replyMarkup: { inline_keyboard: [] },
  });

  assert.deepEqual(payload, {
    chat_id: 'chat-1',
    message_id: 7788,
    text: '#A476 · 店铺A\n状态：已送达',
    reply_markup: { inline_keyboard: [] },
  });
});

test('buildAdminAssignedOrderTelegramMessage only keeps bilingual item lines and other labels stay Chinese', () => {
  const message = buildAdminAssignedOrderTelegramMessage({
    orderNo: '260415010',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    totalAmount: 1200,
    phone: '381600000000',
    pickupEtaMinutes: 15,
    scheduledFor: '',
    itemSummary: [
      '土豆牛肉饼 / Pljeskavica x2 · 600 RSD',
      '可乐 / Coca-Cola x1 · 200 RSD',
    ],
    shopMapUrl: 'https://maps.example.com/shop',
    deliveryMapUrl: 'https://maps.example.com/customer',
    claimCallbackData: 'cb-accept',
    declineCallbackData: 'cb-decline',
  });

  assert.match(message.text, /^你有新的指派订单/m);
  assert.match(message.text, /• 土豆牛肉饼 \/ Pljeskavica x2 · 600 RSD/);
  assert.match(message.text, /• 可乐 \/ Coca-Cola x1 · 200 RSD/);
  assert.deepEqual(flattenInlineButtonTexts(message.replyMarkup.inline_keyboard), ['接单', '暂不接单', '取餐导航', '送餐导航']);
});

test('buildRiderAwaitingPickupTelegramMessage uses awaiting-pickup semantics', () => {
  const message = buildRiderAwaitingPickupTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-pickup',
  });

  assert.match(message.text, /状态：待取餐/);
  assert.ok(findInlineButton(message.replyMarkup.inline_keyboard, '取餐'));
});

test('buildRiderDeliveringTelegramMessage uses delivering semantics', () => {
  const message = buildRiderDeliveringTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-complete',
  });

  assert.match(message.text, /状态：配送中/);
  assert.ok(findInlineButton(message.replyMarkup.inline_keyboard, '送达'));
});

test('legacy rider telegram builders delegate to renamed semantic builders', () => {
  const pickedUpLegacy = buildRiderPickedUpTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-pickup',
  });
  const awaitingPickup = buildRiderAwaitingPickupTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-pickup',
  });
  const completeLegacy = buildRiderDeliveryCompleteTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-complete',
  });
  const delivering = buildRiderDeliveringTelegramMessage({
    orderNo: 'A476',
    shopName: '店铺A',
    address: 'Kralja Petra 10',
    phone: '381600000000',
    totalAmount: 1200,
    pickupEtaMinutes: 15,
    completeCallbackData: 'cb-complete',
  });

  assert.deepEqual(pickedUpLegacy, awaitingPickup);
  assert.deepEqual(completeLegacy, delivering);
});
