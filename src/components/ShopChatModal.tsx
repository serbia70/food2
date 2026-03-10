import { useEffect, useState } from 'preact/hooks';
import { SHOP_EVENTS } from '../lib/events';
import { getUserInfo } from '../lib/userStore';
import { buildCustomerConversationList } from '../lib/customer-chat-conversations';
import { buildOrderDetailState } from '../lib/order-detail-state';
import { buildShopChatContext } from '../lib/shop-chat-state';
import { normalizeUserChatMessages } from '../lib/user-chat-panel-state';
import { ensureUserChatRealtime } from '../lib/user-chat-realtime';
import type { Order } from '../types';

type ShopMap = Record<string, { id?: string; name?: string; slug?: string }>;

export default function ShopChatModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [shopMap, setShopMap] = useState<ShopMap>({});
  const [history, setHistory] = useState<Order[]>([]);
  const [allChatMessages, setAllChatMessages] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatShopId, setChatShopId] = useState(0);
  const [chatShopName, setChatShopName] = useState('当前商家');
  const [chatShopSlug, setChatShopSlug] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const user = getUserInfo();
  const chatContext = buildShopChatContext({
    shopId: chatShopId,
    shopName: chatShopName,
    shopSlug: chatShopSlug,
    userPhone: user.phone || user.login_account || '',
  });

  const customerConversations = buildCustomerConversationList(allChatMessages as any[], shopMap as any);
  const selectedOrderDetail = selectedOrder ? buildOrderDetailState(selectedOrder) : null;

  const loadShopMap = async () => {
    try {
      const res = await fetch('/api/shop/list');
      const data = await res.json();
      const shops = Array.isArray(data?.shops) ? data.shops : [];
      const nextMap: ShopMap = {};
      shops.forEach((shop: any) => {
        const id = String(shop?.id || '').trim();
        if (!id) return;
        nextMap[id] = { id, name: String(shop?.name || '').trim(), slug: String(shop?.slug || '').trim() };
      });
      setShopMap(nextMap);
      return nextMap;
    } catch {}
    return {} as ShopMap;
  };

  const loadHistory = async (phone: string) => {
    if (!phone) return;
    try {
      const res = await fetch(`/api/user/history?phone=${encodeURIComponent(phone)}&page=1&limit=20`);
      const data = await res.json();
      if (data.success) {
        setHistory(Array.isArray(data.orders) ? data.orders : Array.isArray(data.history) ? data.history : []);
      }
    } catch {}
  };

  const loadChatMessages = async () => {
    if (!chatContext.userPhone) return;
    try {
      const res = await fetch(`/api/user/chat?user_phone=${encodeURIComponent(chatContext.userPhone)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setAllChatMessages(data.messages);
        setChatMessages(normalizeUserChatMessages(data.messages, chatContext.shopId));
        requestAnimationFrame(() => {
          const el = document.getElementById('shop-chat-messages');
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    } catch {}
  };

  const openForCurrentShop = async () => {
    const fallbackSlug = String(window.location.pathname || '').replace(/^\//, '').split('/')[0] || '';
    const nextMap = await loadShopMap();
    const activeShop = Object.values(nextMap).find((shop) => String(shop?.slug || '') === fallbackSlug) || {};
    const nextId = Number(activeShop.id || 0);
    setChatShopId(nextId);
    setChatShopName(String(activeShop.name || fallbackSlug || '当前商家'));
    setChatShopSlug(String(activeShop.slug || fallbackSlug));
    setIsOpen(true);
  };

  useEffect(() => {
    const handleOpenChat = () => openForCurrentShop();
    window.addEventListener(SHOP_EVENTS.OPEN_SHOP_CHAT_MODAL, handleOpenChat);
    return () => window.removeEventListener(SHOP_EVENTS.OPEN_SHOP_CHAT_MODAL, handleOpenChat);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadHistory(user.phone || user.login_account || '');
      loadChatMessages();
    }
  }, [isOpen, chatShopId, chatContext.userPhone]);

  useEffect(() => {
    if (!isOpen || !chatContext.shopId || !chatContext.userPhone) return;
    ensureUserChatRealtime({
      shopId: chatContext.shopId,
      userPhone: chatContext.userPhone,
      onMessage(payload) {
        if (!payload || Number(payload.shop_id || 0) !== Number(chatContext.shopId)) return;
        setChatMessages((prev) => normalizeUserChatMessages([...(prev || []), payload], chatContext.shopId));
        requestAnimationFrame(() => {
          const el = document.getElementById('shop-chat-messages');
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
    });
  }, [isOpen, chatContext.shopId, chatContext.userPhone]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.52)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }} onClick={() => setIsOpen(false)}>
      <div style={{ width: 'min(860px, 100%)', height: 'min(720px, 96vh)', background: '#fff', borderRadius: '20px', boxShadow: '0 24px 48px rgba(15,23,42,.22)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(145deg, #22c55e, #059669)', color: '#fff', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', opacity: .86, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>联系商家</div>
            <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>{chatContext.shopName}</div>
            <div style={{ fontSize: '12px', opacity: .9, marginTop: '4px' }}>{chatContext.shopSlug ? `/${chatContext.shopSlug}` : '当前商家会话'}</div>
          </div>
          <button onClick={() => setIsOpen(false)} style={{ width: '32px', height: '32px', borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.18)', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', flex: 1, minHeight: 0 }}>
          <div style={{ background: '#fff', borderRight: '1px solid #e5e7eb', padding: '12px', display: 'grid', gap: '8px', alignContent: 'start', overflowY: 'auto' }}>
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 800 }}>最近联系商家</div>
            {customerConversations.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.7 }}>暂无会话记录</div> : customerConversations.map((shop) => (
              <button key={shop.shopId} type="button" onClick={() => {
                setChatShopId(shop.shopId);
                setChatShopName(shop.shopName);
                setChatShopSlug(shop.shopSlug);
                const relatedOrder = history.find((item: any) => Number(item.shop_id || item.restaurant_id || 0) === Number(shop.shopId));
                setSelectedOrder(relatedOrder || null);
                loadChatMessages();
              }} style={{ width: '100%', textAlign: 'left', border: `1px solid ${chatShopId === shop.shopId ? '#60a5fa' : '#e5e7eb'}`, background: chatShopId === shop.shopId ? '#eff6ff' : '#fff', borderRadius: '12px', padding: '10px 12px', cursor: 'pointer', display: 'grid', gap: '4px' }}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{shop.shopName}</div>
                <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shop.preview || '点击查看会话'}</div>
              </button>
            ))}
          </div>

          <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#fff', minHeight: 0 }}>
            <div style={{ display: 'grid', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: '14px', background: '#fffaf7' }}>
                <div>
                  <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 800 }}>当前会话商家</div>
                  <div style={{ fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{chatContext.shopName}</div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{chatContext.shopSlug ? `/${chatContext.shopSlug}` : '当前商家'}</div>
                </div>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>实时会话</span>
              </div>

              <div style={{ background: '#fffaf7', border: '1px solid #ffedd5', borderRadius: '14px', padding: '14px', display: 'grid', gap: '10px' }}>
                <div style={{ fontSize: '12px', color: '#9a3412', fontWeight: 900 }}>订单协助信息</div>
                {selectedOrder ? (() => {
                  const detail = buildOrderDetailState(selectedOrder);
                  return (
                    <>
                      <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>#{detail.orderNo}</div>
                      <div style={{ fontSize: '13px', color: '#475569' }}>{detail.statusLabel} · {detail.amount}</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{detail.createdAt}</div>
                      <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#334155' }}>
                        {detail.items.slice(0, 3).map((item, idx) => <div key={idx}>• {item}</div>)}
                      </div>
                      {detail.address ? <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>📍 {detail.address}</div> : null}
                    </>
                  );
                })() : <div style={{ color: '#9a3412', fontSize: '13px', lineHeight: 1.7 }}>当前会话暂无绑定订单。</div>}
              </div>
            </div>

            <div id="shop-chat-messages" style={{ flex: 1, minHeight: 0, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '12px', overflowY: 'auto', display: 'grid', gap: '8px' }}>
              {chatMessages.length === 0 ? <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px 8px' }}>暂无聊天记录，先发第一条消息吧。</div> : chatMessages.map((msg, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender_role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{ maxWidth: '85%', background: msg.sender_role === 'user' ? '#ffedd5' : '#ffffff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: msg.sender_role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '10px 12px', boxShadow: '0 6px 14px rgba(15,23,42,.04)' }}>
                    <div style={{ fontSize: '13px', lineHeight: 1.6 }}>{msg.message}</div>
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', padding: '0 4px' }}>{msg.created_at ? new Date(msg.created_at).toLocaleString('sr-RS', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                </div>
              ))}
            </div>

            {!chatContext.userPhone ? (
              <div style={{ border: '1px solid #e2e8f0', background: '#fff', borderRadius: '14px', padding: '12px', color: '#475569', fontSize: '13px', lineHeight: 1.6 }}>
                请先登录后再聊天。
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setTimeout(() => window.dispatchEvent(new Event(SHOP_EVENTS.OPEN_USER_MODAL)), 0);
                  }}
                  style={{ marginLeft: '10px', padding: '8px 10px', borderRadius: '10px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 800, cursor: 'pointer' }}
                >
                  去登录
                </button>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={chatInput}
                onInput={(e) => setChatInput((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    (document.getElementById('shop-chat-send-btn') as HTMLButtonElement | null)?.click();
                  }
                }}
                placeholder={chatContext.userPhone ? '输入消息...' : '登录后可发送消息'}
                disabled={!chatContext.userPhone}
                style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: chatContext.userPhone ? '#fff' : '#f1f5f9' }}
              />
              <button id="shop-chat-send-btn" onClick={async () => {
                const message = chatInput.trim();
                if (!message || !chatContext.userPhone || !chatContext.shopId) return;
                try {
                  const res = await fetch('/api/user/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shop_id: chatContext.shopId, sender_phone: chatContext.userPhone, message }),
                  });
                  const data = await res.json();
                  if (data.success) {
                    setChatInput('');
                    loadChatMessages();
                  }
                } catch {}
              }} disabled={!chatContext.userPhone || !chatContext.shopId} style={{ padding: '12px 16px', borderRadius: '12px', border: 'none', background: '#ff4b33', color: '#fff', fontWeight: 800, cursor: !chatContext.userPhone || !chatContext.shopId ? 'not-allowed' : 'pointer', opacity: !chatContext.userPhone || !chatContext.shopId ? 0.55 : 1, boxShadow: '0 10px 18px rgba(255,75,51,.22)' }}>发送</button>
            </div>

            <button onClick={() => setIsOpen(false)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>关闭</button>
          </div>
        </div>
      </div>
    </div>
  );
}
