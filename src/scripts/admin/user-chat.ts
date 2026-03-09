
import { getAdminHandler, getAdminRuntimeState } from './globals';
import { buildRecentChatPhones, chooseChatPhoneOnOpen } from '../../lib/admin-chat-state';

let adminChatOpen = false;
let currentChatUserPhone = '';

let currentShopId: string = '';
let chatMqttClient: any;
let chatMqttInitInFlight = false;
let chatMqttRetryCount = 0;
let chatMqttSubscribed = false;

function getShopId(): string {
  try {
    const v = getAdminRuntimeState().shopId;
    if (v !== undefined && v !== null) return String(v);
  } catch (e) {}
  return '';
}

function parseBroker(rawBroker: string) {
  const v = String(rawBroker || '').trim();
  if (!v) return { host: 'mqtt.serbia70.com', port: 443, path: '/mqtt', useSSL: true };
  if (v.startsWith('ws://') || v.startsWith('wss://')) {
    try {
      const u = new URL(v);
      return {
        host: u.hostname,
        port: Number(u.port || (u.protocol === 'wss:' ? 443 : 80)),
        path: u.pathname || '/mqtt',
        useSSL: u.protocol === 'wss:',
      };
    } catch (e) {}
  }
  if (v.indexOf('serbia70.com') !== -1) {
    return { host: 'mqtt.serbia70.com', port: 443, path: '/mqtt', useSSL: true };
  }
  return { host: v, port: 8083, path: '/mqtt', useSSL: false };
}

function showAdminChatBadge() {
  const title = document.getElementById('admin-chat-title');
  if (!title) return;
  if (!title.textContent?.includes('•')) title.textContent = `• ${title.textContent || '用户聊天'}`;
}

function ensureGlobalChatBell() {
  // Removed: global bell button (we use dock button to match user chat UX)
  return;

  // Removed: we use the in-panel dock button for a consistent UX with user-side chat.
}

function ensureChatDockButton() {
  if (document.getElementById('admin-chat-dock')) return;
  const panel = document.getElementById('admin-chat-panel');
  if (!panel) return;

  const dock = document.createElement('button');
  dock.id = 'admin-chat-dock';
  dock.type = 'button';
  dock.style.cssText = `
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 56px;
    height: 56px;
    border-radius: 999px;
    border: none;
    background: #0ea5e9;
    color: #fff;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(2,132,199,0.35);
    z-index: 10002;
  `;
  dock.textContent = '💬';
  const badge = document.createElement('span');
  badge.id = 'admin-chat-dock-badge';
  setStyles(badge, {
    display: 'none',
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    minWidth: '18px',
    height: '18px',
    padding: '0 5px',
    borderRadius: '999px',
    background: '#ef4444',
    color: '#fff',
    fontSize: '11px',
    lineHeight: '18px',
    textAlign: 'center',
    boxShadow: '0 0 0 2px rgba(255,255,255,0.9)',
  });
  dock.appendChild(badge);
  dock.addEventListener('click', () => toggleAdminChat());
  document.body.appendChild(dock);
}

function setBellBadge(_count: number) {}

function setDockBadge(count: number) {
  const el = document.getElementById('admin-chat-dock-badge');
  if (!el) return;
  if (count > 0) {
    el.textContent = String(Math.min(99, count));
    (el as HTMLElement).style.display = 'block';
  } else {
    (el as HTMLElement).style.display = 'none';
  }
}

const unreadByPhone: Record<string, number> = Object.create(null);
let lastUnreadPhone: string = '';

function setStyles(el: HTMLElement, styles: Record<string, string>) {
  Object.entries(styles).forEach(([key, value]) => {
    (el.style as any)[key] = value;
  });
}

function setContainerMessage(container: HTMLElement | null, text: string, color = '#64748b') {
  if (!container) return;
  const div = document.createElement('div');
  setStyles(div, {
    textAlign: 'center',
    color,
    padding: '20px',
  });
  div.textContent = text;
  container.replaceChildren(div);
}

function createAdminChatMessageNode(message: any) {
  const role = String(message?.sender_role || '');
  const isShopSide = role === 'admin' || role === 'shop';
  const wrap = document.createElement('div');
  setStyles(wrap, {
    marginBottom: '10px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: isShopSide ? 'flex-end' : 'flex-start',
  });

  const bubble = document.createElement('div');
  setStyles(bubble, {
    maxWidth: '80%',
    padding: '8px 12px',
    borderRadius: '12px',
    background: isShopSide ? '#0891b2' : '#e5e7eb',
    color: isShopSide ? '#fff' : '#1f2937',
    fontSize: '14px',
  });
  bubble.textContent = String(message?.message || '');

  const ts = document.createElement('div');
  setStyles(ts, {
    fontSize: '10px',
    color: '#9ca3af',
    marginTop: '4px',
  });
  ts.textContent = new Date(message?.created_at).toLocaleString('zh-CN');

  wrap.append(bubble, ts);
  return wrap;
}


function incUnread(phone: string) {
  const p = String(phone || '').trim();
  if (!p) return;
  unreadByPhone[p] = (unreadByPhone[p] || 0) + 1;
  lastUnreadPhone = p;
  const total = Object.values(unreadByPhone).reduce((a, b) => a + b, 0);
  setDockBadge(total);
}

function clearUnread(phone?: string) {
  if (phone) {
    delete unreadByPhone[String(phone).trim()];
  } else {
    for (const k of Object.keys(unreadByPhone)) delete unreadByPhone[k];
  }
  const total = Object.values(unreadByPhone).reduce((a, b) => a + b, 0);
  setDockBadge(total);
}


function renderUserPickerLoading() {
  const messagesEl = document.getElementById('admin-chat-messages');
  if (!messagesEl) return;
  setContainerMessage(messagesEl, '正在加载会话...');
}

function renderUserPicker(phones: string[]) {
  const messagesEl = document.getElementById('admin-chat-messages');
  if (!messagesEl) return;

  const unique = Array.from(new Set(phones.map((p) => String(p || '').trim()).filter(Boolean)));
  if (unique.length === 0) {
    setContainerMessage(messagesEl, '暂无会话记录');
    return;
  }

  // Prefer showing unread users first.
  unique.sort((a, b) => {
    const au = unreadByPhone[a] || 0;
    const bu = unreadByPhone[b] || 0;
    if (bu !== au) return bu - au;
    return a.localeCompare(b);
  });

  const wrap = document.createElement('div');
  wrap.style.padding = '10px';
  const tip = document.createElement('div');
  setStyles(tip, { fontSize: '12px', color: '#64748b', marginBottom: '10px' });
  tip.textContent = '选择一个用户开始聊天';
  wrap.appendChild(tip);

  unique.slice(0, 30).forEach((p) => {
    const n = unreadByPhone[p] || 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.phone = p;
    setStyles(btn, {
      width: '100%',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 12px',
      border: '1px solid #e5e7eb',
      borderRadius: '10px',
      background: '#fff',
      cursor: 'pointer',
      marginBottom: '10px',
    });
    const phoneText = document.createElement('span');
    setStyles(phoneText, { fontWeight: '600', color: '#0f172a' });
    phoneText.textContent = p;
    const badge = document.createElement('span');
    setStyles(badge, {
      display: n > 0 ? 'inline-block' : 'none',
      minWidth: '22px',
      height: '22px',
      padding: '0 7px',
      borderRadius: '999px',
      background: '#ef4444',
      color: '#fff',
      fontSize: '12px',
      lineHeight: '22px',
      textAlign: 'center',
    });
    badge.textContent = String(Math.min(99, n));
    btn.append(phoneText, badge);
    btn.addEventListener('click', () => openChatForPhone(p));
    wrap.appendChild(btn);
  });
  messagesEl.replaceChildren(wrap);
}

function hideAdminChatBadge() {
  const title = document.getElementById('admin-chat-title');
  if (!title) return;
  title.textContent = String(title.textContent || '').replace(/^•\s*/, '');
}

function playChatNotify() {
  try {
    const mode = (document.getElementById('sound-mode') as HTMLSelectElement)?.value || 'voice';
    if (mode === 'voice') {
      const speech = window.speechSynthesis;
      if (speech) {
        try { speech.cancel(); } catch (e) {}
        const u = new SpeechSynthesisUtterance('您有新的聊天信息了');
        u.lang = 'zh-CN';
        try { speech.speak(u); } catch (e) {}
        return;
      }
    }

    // Fallback to existing beep/voice system.
    const fn = getAdminHandler<() => void>('playAudio');
    if (typeof fn === 'function') fn('pending', 'dine_in');
  } catch (e) {}
}

function scheduleChatMqttReconnect() {
  chatMqttInitInFlight = false;
  chatMqttSubscribed = false;
  chatMqttRetryCount = Math.min(chatMqttRetryCount + 1, 20);
  const delay = Math.min(30000, 1500 + chatMqttRetryCount * 1500);
  setTimeout(() => initAdminChatRealtime(), delay);
}

function initAdminChatRealtime() {
  const shopId = getShopId();
  if (!shopId) return;
  currentShopId = shopId;
  if (chatMqttInitInFlight) return;
  if (chatMqttClient && (chatMqttClient.connected || chatMqttClient.connecting)) return;
  if (typeof window.Paho === 'undefined') return;

  chatMqttInitInFlight = true;
  const b = parseBroker(String(getAdminRuntimeState().brokerIp || 'mqtt.serbia70.com'));
  const clientId = 'admin_chat_' + shopId + '_' + Math.random().toString(16).slice(2, 8);
  const topic = `shop/${shopId}/chat/+`;

  chatMqttClient = new window.Paho.MQTT.Client(b.host, Number(b.port), b.path || '/mqtt', clientId);

  chatMqttClient.onConnectionLost = () => {
    chatMqttInitInFlight = false;
    scheduleChatMqttReconnect();
  };
  chatMqttClient.onMessageArrived = (m: any) => {
    try {
      const payload = JSON.parse(m?.payloadString || '{}');
      if (Number(payload.shop_id || 0) !== Number(shopId)) return;

      const phone = String(payload.sender_phone || '').trim();
      if (!phone) return;

      const shouldRefresh = currentChatUserPhone && phone === currentChatUserPhone;
      if (shouldRefresh) {
        loadAdminChat();
        if (!adminChatOpen) {
          showAdminChatBadge();
          playChatNotify();
          incUnread(phone);
        }
        return;
      }

      // Not the active chat: still notify.
      showAdminChatBadge();
      playChatNotify();
      incUnread(phone);
    } catch (e) {}
  };

  const opts: any = {
    useSSL: !!b.useSSL,
    timeout: 5,
    keepAliveInterval: 60,
    onSuccess: () => {
      chatMqttRetryCount = 0;
      chatMqttInitInFlight = false;
      try { chatMqttClient.subscribe(topic); } catch (e) {}
      chatMqttSubscribed = true;
    },
    onFailure: () => {
      chatMqttInitInFlight = false;
      scheduleChatMqttReconnect();
    },
  };

  // Reuse the same admin settings where possible.
  try {
    const settings = getAdminRuntimeState().currentSettings;
    if (settings?.mqtt_username) opts.userName = String(settings.mqtt_username);
    if (settings?.mqtt_password) opts.password = String(settings.mqtt_password);
  } catch (e) {}

  try {
    chatMqttClient.connect(opts);
  } catch (e) {
    chatMqttInitInFlight = false;
    scheduleChatMqttReconnect();
  }
}

export async function loadUserChat(userPhone: string) {
  if (!userPhone) return { success: false, error: "no phone" };
  try {
    const res = await fetch(`/api/user/chat?user_phone=${encodeURIComponent(userPhone)}`);
    return await res.json();
  } catch (e) {
    return { success: false, error: "network error" };
  }
}

export async function sendUserChat(userPhone: string, message: string) {
  try {
    const res = await fetch("/api/user/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_phone: userPhone, message: message })
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: "network error" };
  }
}

export async function loadAdminChat() {
  if (!currentChatUserPhone) {
    renderUserPickerLoading();
    try {
      const res = await fetch('/api/admin/chat');
      const data = await res.json();
      if (data && data.success && Array.isArray(data.messages)) {
        const phones = buildRecentChatPhones(data.messages || [], unreadByPhone);
        renderUserPicker(phones);
      } else {
        renderUserPicker([]);
      }
    } catch (e) {
      const messagesEl = document.getElementById('admin-chat-messages');
      setContainerMessage(messagesEl, '加载会话失败', '#ef4444');
    }
    return;
  }
  try {
    const res = await fetch(`/api/admin/chat?sender_phone=${encodeURIComponent(currentChatUserPhone)}`);
    const data = await res.json();
    if (data.success) {
      renderAdminMessages(data.messages || []);
    }
  } catch(e) {
    const messagesEl = document.getElementById('admin-chat-messages');
    setContainerMessage(messagesEl, '加载失败');
  }
}

function renderAdminMessages(messages: any[]) {
  const container = document.getElementById('admin-chat-messages');
  if (!container) return;
  
  if (!messages || messages.length === 0) {
    setContainerMessage(container, '暂无消息');
    return;
  }
  const nodes = messages.map((m: any) => createAdminChatMessageNode(m));
  container.replaceChildren(...nodes);
  container.scrollTop = container.scrollHeight;
}

export async function sendAdminChat() {
  if (!currentChatUserPhone) {
    alert('请先选择用户');
    return;
  }
  const input = document.getElementById('admin-chat-input') as HTMLInputElement;
  const message = input?.value.trim();
  if (!message) return;
  
  try {
    const res = await fetch('/api/admin/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender_phone: currentChatUserPhone, message: message })
    });
    const data = await res.json();
    if (data.success) {
      input.value = '';
      loadAdminChat();
    }
  } catch(e) {
    alert('发送失败');
  }
}

export function openChatForPhone(phone: string) {
  currentChatUserPhone = phone;
  adminChatOpen = true;
  const panel = document.getElementById('admin-chat-panel');
  if (panel) panel.style.display = 'flex';
  const titleEl = document.getElementById('admin-chat-title');
  if (titleEl) titleEl.textContent = `与用户 ${phone} 聊天`;
  hideAdminChatBadge();
  clearUnread(phone);
  loadAdminChat();
  initAdminChatRealtime();
}

export function toggleAdminChat() {
  adminChatOpen = !adminChatOpen;
  const panel = document.getElementById('admin-chat-panel');
  if (panel) panel.style.display = adminChatOpen ? 'flex' : 'none';
  if (!adminChatOpen) {
    currentChatUserPhone = '';
    return;
  }

  const unreadPhone = chooseChatPhoneOnOpen(lastUnreadPhone);
  if (unreadPhone) {
    openChatForPhone(unreadPhone);
    return;
  }

  hideAdminChatBadge();
  currentChatUserPhone = '';
  loadAdminChat();
  initAdminChatRealtime();
}

export function initAdminChatUI() {
  const existingPanel = document.getElementById('admin-chat-panel');
  if (existingPanel) return;
  
  const panel = document.createElement('div');
  panel.id = 'admin-chat-panel';
  panel.style.cssText = `
    display: none;
    position: fixed;
    bottom: 150px;
    right: 20px;
    width: 320px;
    height: 400px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    z-index: 10000;
    flex-direction: column;
  `;
  const header = document.createElement('div');
  setStyles(header, {
    padding: '12px',
    background: '#0891b2',
    color: '#fff',
    borderRadius: '12px 12px 0 0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  });
  const title = document.createElement('span');
  title.id = 'admin-chat-title';
  title.style.fontWeight = '600';
  title.textContent = '用户聊天';
  const close = document.createElement('span');
  close.id = 'admin-chat-close';
  setStyles(close, { cursor: 'pointer', fontSize: '18px' });
  close.textContent = '×';
  header.append(title, close);

  const messages = document.createElement('div');
  messages.id = 'admin-chat-messages';
  setStyles(messages, { flex: '1', overflowY: 'auto', padding: '10px', background: '#f9fafb' });
  setContainerMessage(messages, '请选择用户开始聊天');

  const footer = document.createElement('div');
  setStyles(footer, { padding: '10px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px' });
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'admin-chat-input';
  input.placeholder = '输入消息...';
  setStyles(input, { flex: '1', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' });
  const send = document.createElement('button');
  send.id = 'admin-chat-send';
  send.type = 'button';
  setStyles(send, { padding: '8px 16px', background: '#0891b2', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' });
  send.textContent = '发送';
  footer.append(input, send);
  panel.append(header, messages, footer);
  document.body.appendChild(panel);

  // Add a visible chat button inside the panel (bottom-right).
  ensureChatDockButton();
  
  document.getElementById('admin-chat-close')?.addEventListener('click', toggleAdminChat);
  document.getElementById('admin-chat-send')?.addEventListener('click', sendAdminChat);
  document.getElementById('admin-chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAdminChat();
  });
}

// Try to init realtime as early as possible.
try {
  ensureGlobalChatBell();
  initAdminChatRealtime();
  // Ensure dock button exists if panel was already created.
  ensureChatDockButton();
} catch (e) {}

// Allow mqtt-audio.ts to forward chat events here (single MQTT client for admin).
try {
  window.__adminChatOnMessage = (payload: any) => {
    const shopId = getShopId();
    if (!shopId) return;
    if (Number(payload?.shop_id || 0) !== Number(shopId)) return;
    const phone = String(payload?.sender_phone || '').trim();
    if (!phone) return;

    const shouldRefresh = currentChatUserPhone && phone === currentChatUserPhone;
    if (shouldRefresh) {
      loadAdminChat();
      if (!adminChatOpen) {
        showAdminChatBadge();
        playChatNotify();
        incUnread(phone);
      }
      return;
    }

    showAdminChatBadge();
    playChatNotify();
    incUnread(phone);
  };
} catch (e) {}
