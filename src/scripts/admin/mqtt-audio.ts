
import { getAdminHandler, getAdminRuntimeState, showAdminToast } from './globals';

// Extracting MQTT and Audio Logic from AdminScripts.astro
let mqttClient: any;
let audioCtx: any;
let speakQueue: string[] = [];
let isSpeaking = false;
let lastSpeakTime = 0;

export function initMqtt(shopSlug: string, mqttSecret: string, brokerIp: string, settings: any) {
  if (window.__adminMqttInitInFlight) return;
  if (mqttClient && (mqttClient.connected || mqttClient.connecting)) return;
  if (typeof window.Paho === 'undefined') return;

  window.__adminMqttInitInFlight = true;
  const clientId = 'admin_' + shopSlug + '_' + Math.random().toString(16).slice(2, 8);
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const rawBroker = brokerIp || 'mqtt.serbia70.com';
  const isRemoteProd = rawBroker.includes('serbia70.com');

  const finalHost = isRemoteProd ? 'mqtt.serbia70.com' : rawBroker;
  const finalPort = isRemoteProd ? 443 : 8083;
  const finalPath = '/mqtt';
  const finalSSL = isRemoteProd;

  mqttClient = new window.Paho.MQTT.Client(finalHost, Number(finalPort), finalPath, clientId);
  window.mqttClient = mqttClient;

  mqttClient.onConnectionLost = (res: any) => {
    window.__adminMqttInitInFlight = false;
    if (res.errorCode !== 0) {
      updateMqttStatus('disconnected');
      setTimeout(() => initMqtt(shopSlug, mqttSecret, brokerIp, settings), 2000);
    }
  };

  mqttClient.onMessageArrived = (message: any) => {
    try {
      const payload = JSON.parse(message.payloadString);
      handleRealtimePayload(payload);
    } catch (e) {}
  };

  const options = {
    useSSL: finalSSL,
    timeout: 5,
    keepAliveInterval: 60,
    onSuccess: () => {
      window.__adminMqttInitInFlight = false;
      updateMqttStatus('connected');
      mqttClient.connected = true;
      const topic = `restaurant/${shopSlug}/${mqttSecret || 'default'}/order`;
      mqttClient.subscribe(topic);
      mqttClient.subscribe(topic.replace('/order', '/status'));
      const shopId = getAdminRuntimeState().shopId;
      if (shopId) mqttClient.subscribe(`shop/${shopId}/orders`);
      if (shopId) mqttClient.subscribe(`shop/${shopId}/chat/+`);
    },
    onFailure: () => {
      window.__adminMqttInitInFlight = false;
      updateMqttStatus('failed');
      setTimeout(() => initMqtt(shopSlug, mqttSecret, brokerIp, settings), 2000);
    }
  };
  mqttClient.connect(options);
}

function updateMqttStatus(status: string) {
  const el = document.getElementById('mqtt-status-indicator');
  if (!el) return;
  el.textContent = status === 'connected' ? 'MQTT: 已连接' : (status === 'failed' || status === 'disconnected' ? 'MQTT: 已断开' : 'MQTT: 连接中...');
  el.style.background = status === 'connected' ? '#e8f5e9' : '#ffebee';
}

export function enableAudio() {
  const hasAudio = window.AudioContext || window.webkitAudioContext;
  if (!hasAudio) return;
  if (!audioCtx) audioCtx = new hasAudio();
  audioCtx.resume().then(() => {
    const el = document.getElementById('sound-status');
    if (el) {
      el.classList.replace('status-off', 'status-on');
      el.innerText = '声音已激活 (Active)';
    }
    beep();
  });
}

function beep() {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = 800;
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.5);
  osc.stop(audioCtx.currentTime + 0.5);
}

export function playAudio(status = 'pending', orderType = 'dine_in') {
  const mode = (document.getElementById('sound-mode') as HTMLSelectElement)?.value || 'voice';
  if (mode === 'voice') {
    const text = status === 'review_needed' ? '您有加菜请求，请及时审核。' : 
                 (orderType === 'delivery' ? '您有新的外卖订单，请及时处理。' : '您有新的堂食订单，请及时处理。');
    queueSpeak(text);
  } else {
    beep();
  }
}

function queueSpeak(text: string) {
  if (Date.now() - lastSpeakTime < 5000 && speakQueue.includes(text)) return;
  speakQueue.push(text);
  if (!isSpeaking) processSpeakQueue();
}

async function processSpeakQueue() {
  if (speakQueue.length === 0) { isSpeaking = false; return; }
  isSpeaking = true;
  const text = speakQueue.shift()!;
  lastSpeakTime = Date.now();
  await speakWithPromise(text);
  setTimeout(processSpeakQueue, 1000);
}

function speakWithPromise(text: string) {
  return new Promise<void>((resolve) => {
    if (!window.speechSynthesis) { beep(); resolve(); return; }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.onend = () => resolve();
    u.onerror = () => resolve();
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('CN'));
    if (zhVoice) u.voice = zhVoice;
    try { window.speechSynthesis.speak(u); } catch(e) { resolve(); }
  });
}

const processedMessages = new Set();
function handleRealtimePayload(payload: any) {
  if (!payload || typeof payload !== 'object') return;

  // Best-effort: if toast helper is missing, still notify.
  const toast = (msg: string) => {
    try {
      const toast = getAdminHandler<(msg: string) => void>('showToast');
      if (typeof toast === 'function') {
        toast(msg);
        return;
      }
    } catch {}
    console.log('[admin-toast]', msg);
  };

  // Chat realtime payload: forward to admin chat UI if installed.
  // Expected shape: { shopId, senderRole, senderPhone, message, createdAt }
  try {
    const maybeMessage = String(payload?.message || '').trim();
    const maybePhone = String(payload?.senderPhone || '').trim();
    const maybeRole = String(payload?.senderRole || '').trim();
    const maybeShop = Number(payload?.shopId || 0);
    if (maybeMessage && maybePhone && maybeShop > 0 && (maybeRole === 'user' || maybeRole === 'shop' || maybeRole === 'admin')) {
      const cb = window.__adminChatOnMessage;
      if (typeof cb === 'function') {
        cb(payload);
        return;
      }
    }
  } catch (e) {}
  const key = `${payload.event||payload.type}:${payload.reservation_id||payload.order_id||payload.id}:${payload.status}`;
  if (processedMessages.has(key)) return;
  processedMessages.add(key);
  if (processedMessages.size > 100) processedMessages.delete(processedMessages.values().next().value);

  const isRes = (payload.event || payload.type)?.includes('reservation');
  if (isRes) {
    toast(payload.event?.includes('new') ? '收到新预约订单' : '预约状态已更新');
    if (payload.event?.includes('new')) queueSpeak('你有新预约订单，请及时处理。');
    const loadReservationStats = getAdminHandler<() => void>('loadReservationStats');
    const loadReservations = getAdminHandler<() => void>('loadReservations');
    if (typeof loadReservationStats === 'function') loadReservationStats();
    if (typeof loadReservations === 'function') loadReservations();
    return;
  }

  if (payload.type?.includes('sync') || payload.type?.includes('checkout')) {
    const refreshOrderList = getAdminHandler<() => void>('refreshOrderList');
    if (typeof refreshOrderList === 'function') refreshOrderList();
    return;
  }

  // 修复：只有新订单或加菜请求才播放语音，状态变更（如结账、配送）不播放
  // Fix: Only play audio for new orders or review requests. Status updates (like checkout/delivering) should NOT play audio.
  const isCreation = payload.event === 'new_order' || payload.event === 'order';
  const isReview = payload.status === 'review_needed';
  
  const orderType = String(payload?.orderType || payload?.order_type || '').trim();

  if (payload.event === 'status_update' && String(payload.status || '') === 'awaiting_courier') {
    return;
  }

  if (isCreation || isReview) {
    toast(payload.status === 'review_needed' ? '有加菜请求，等待审核' : '新订单来了');
    playAudio(payload.status, orderType);
  } else if (payload.event === 'status_update') {
    toast(`订单 #${payload.order_id || ''} 状态已更新`);
  }

  const refreshOrderList = getAdminHandler<() => void>('refreshOrderList');
  if (typeof refreshOrderList === 'function') refreshOrderList();
  else setTimeout(() => location.reload(), 3000);
}

