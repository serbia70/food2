import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { User } from '../types';
import { buildCurrentShopEmptyStateMessage, splitOrdersByCurrentShop } from '../lib/shop-scoped-orders';
import { buildUserOrderView, type UserOrderShopMap } from '../lib/user-order-view';
import { buildUserAddressPayload, parseUserAddress } from '../lib/user-address-state';
import { getCouponEmptyState, getServicePanelState } from '../lib/user-coupon-state';
import { buildOrderDetailState } from '../lib/order-detail-state';
import { buildShopChatContext } from '../lib/shop-chat-state';
import { getContactShopLabel } from '../lib/shop-chat-copy';
import { normalizeUserChatMessages } from '../lib/user-chat-panel-state';
import { ensureUserChatRealtime } from '../lib/user-chat-realtime';
import { buildCustomerConversationList } from '../lib/customer-chat-conversations';

type ConflictGuide = null | {
  title: string;
  description: string;
  actionLabel: string;
  loginHref?: string;
};

type Props = {
  userInfo: User | null;
  currentShopName: string;
  currentShopSlug: string;
  currentShopId: string;
  addressSummary: string;
  membershipLabel: string;
  history: any[];
  shopMap: UserOrderShopMap;
  loading: boolean;
  hasMoreHistory: boolean;
  isLoadingMore: boolean;
  phoneConflictGuide: ConflictGuide;
  onContinueShop?: () => void;
  onViewAllOrders?: () => void;
  onManageAddress?: () => void;
  onCoupons?: () => void;
  onService?: () => void;
  onEditNickname?: () => void;
  onEditPhone?: () => void;
  onLogout?: () => void;
  onConflictLogin?: () => void;
  onLoadMore?: () => void;
  initialChatOpen?: boolean;
  openChatSignal?: number;
};

const overlayPanelStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15,23,42,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10001,
  padding: '20px',
} as const;

const overlayCardStyle = {
	width: '100%',
	maxWidth: '420px',
	background: '#fff',
	borderRadius: '20px',
	padding: '20px',
	boxShadow: '0 24px 48px rgba(15,23,42,.18)',
	animation: 'userCenterPopIn 0.22s ease',
} as const;

function renderStatus(order: any): ComponentChildren {
  if (order.status === 'delivering') {
    return (
      <div style={{ background: '#e3f2fd', color: '#1565c0', padding: '10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🛵</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>派送中 / Delivering</div>
          {order.courier_name && <div style={{ fontSize: '12px', opacity: 0.8 }}>骑手: {order.courier_name} ({order.courier_phone})</div>}
        </div>
        {order.courier_phone && <a href={`tel:${order.courier_phone}`} style={{ background: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', textDecoration: 'none', color: '#1565c0', border: '1px solid #1565c0' }}>拨打</a>}
      </div>
    );
  }

  const label = order.status === 'pending'
    ? '等待接单 / Pending'
    : order.status === 'confirmed'
      ? '商家已接单 / Confirmed'
      : order.status === 'completed'
        ? '已送达 / Completed'
        : '订单已关闭';

  const bg = order.status === 'pending' ? '#fff7ed' : order.status === 'confirmed' ? '#eff6ff' : order.status === 'completed' ? '#ecfdf5' : '#f1f5f9';
  const color = order.status === 'pending' ? '#c2410c' : order.status === 'confirmed' ? '#1d4ed8' : order.status === 'completed' ? '#047857' : '#475569';
  return <span style={{ padding: '5px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '900', background: bg, color }}>{label}</span>;
}

function renderOrderCard(order: any, idx: number, shopMap: UserOrderShopMap, onContactShop?: (order: any) => void): ComponentChildren {
  const orderView = buildUserOrderView(order, shopMap);
  const addressSummary = String(order.table_info || '')
    .replace(/\s*\[货到付款\/Cash\].*$/u, '')
    .replace(/\s*\(备注:.*$/u, '')
    .trim();
  const shortAddress = addressSummary.length > 52 ? `${addressSummary.slice(0, 52)}...` : addressSummary;

  let itemNodes: ComponentChildren = '商品解析失败';
  try {
    const items = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
    const itemsArray = Array.isArray(items) ? items : Object.values(items || {});
    itemNodes = itemsArray.map((i: any, iIdx: number) => (
      <div key={iIdx} style={{ marginBottom: '4px' }}>
        • {i.name} <span style={{ color: '#718096', fontSize: '11px' }}>({i.subName || i.sub_name})</span> x{i.quantity}
      </div>
    ));
  } catch {
    itemNodes = '商品解析失败';
  }

  return (
    <div key={`${order.order_no || idx}`} className="history-order-card">
      <div className="order-top">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div className="order-brand-row">
              <div className="order-brand-badge">{(orderView.shopName || '店').trim().charAt(0)}</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '14px', fontWeight: '900', color: '#1f2937', marginBottom: '2px' }}>{orderView.shopName}</span>
                {orderView.shopSlug ? <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>/ {orderView.shopSlug}</span> : null}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
              {renderStatus(order)}
              <span style={{ color: '#e53e3e', fontSize: '20px', fontWeight: '900', lineHeight: 1 }}>{Number(order.total_amount || 0).toLocaleString()} RSD</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: '#999' }}>#{order.order_no}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', background: '#eff6ff', color: '#1d4ed8', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', fontWeight: 800 }}>
                取餐号 {String(order.order_no || '').slice(-3)}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', background: '#fff7ed', color: '#9a3412', borderRadius: '999px', padding: '4px 10px', fontSize: '11px', fontWeight: 700 }}>
                {new Date(order.created_at || '').toLocaleString('sr-RS', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <button className="tool-link-btn" onClick={(e) => {
              e.stopPropagation();
              onContactShop?.(order);
            }}>{getContactShopLabel(orderView.shopName)}</button>
          </div>
        </div>
      </div>

      {orderView.membershipLabel && (
        <div style={{ padding: '8px 14px 0', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ background: orderView.isVip ? '#fff7ed' : '#ecfdf5', color: orderView.isVip ? '#c2410c' : '#047857', border: `1px solid ${orderView.isVip ? '#fdba74' : '#a7f3d0'}`, borderRadius: '999px', padding: '4px 10px', fontSize: '11px', fontWeight: '700' }}>
            {orderView.membershipLabel}
          </span>
        </div>
      )}

      <div className="order-summary-shell">
        <div className="order-summary-title">商品摘要</div>
        <div className="order-content" style={{ fontSize: '13px', color: '#4a5568' }}>{itemNodes}</div>
      </div>

      {addressSummary && (
        <div className="order-address-shell">
          <div className="order-summary-title">配送地址</div>
          <div style={{ fontSize: '12px', color: '#718096', lineHeight: 1.6 }}>📍 {shortAddress}</div>
        </div>
      )}
    </div>
  );
}

export default function UserCenterPanel(props: Props) {
  const {
    userInfo,
    currentShopName,
    currentShopSlug,
    currentShopId,
    addressSummary,
    membershipLabel,
    history,
    shopMap,
    loading,
    hasMoreHistory,
    isLoadingMore,
    phoneConflictGuide,
    onContinueShop,
    onViewAllOrders,
    onManageAddress,
    onCoupons,
    onService,
    onEditNickname,
    onEditPhone,
    onLogout,
    onConflictLogin,
    onLoadMore,
    initialChatOpen,
    openChatSignal,
  } = props;

  const { currentShopOrders, otherOrders } = splitOrdersByCurrentShop(history as any[], {
    id: currentShopId,
    slug: currentShopSlug,
  });

  const parsedAddress = parseUserAddress(addressSummary);
  const [isAddressEditorOpen, setIsAddressEditorOpen] = useState(false);
  const [addressName, setAddressName] = useState(parsedAddress.name);
  const [addressPhone, setAddressPhone] = useState(parsedAddress.phone);
  const [addressDetail, setAddressDetail] = useState(parsedAddress.detail);
  const [isCouponPanelOpen, setIsCouponPanelOpen] = useState(false);
  const [isServicePanelOpen, setIsServicePanelOpen] = useState(Boolean(initialChatOpen));
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [allChatMessages, setAllChatMessages] = useState<any[]>([]);
  const [chatShopId, setChatShopId] = useState(Number(currentShopId || 0));
  const [chatShopName, setChatShopName] = useState(String(currentShopName || '当前店铺'));
  const [chatShopSlug, setChatShopSlug] = useState(String(currentShopSlug || ''));
  const couponState = getCouponEmptyState();
  const serviceState = getServicePanelState();
  const chatContext = buildShopChatContext({
    shopId: chatShopId,
    shopName: chatShopName,
    shopSlug: chatShopSlug,
    userPhone: userInfo?.phone || '',
  });

  const loadChatMessages = async () => {
    if (!chatContext.userPhone) return;
    try {
      const res = await fetch(`/api/user/chat?user_phone=${encodeURIComponent(chatContext.userPhone)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setAllChatMessages(data.messages);
        const filtered = normalizeUserChatMessages(data.messages, chatContext.shopId);
        setChatMessages(filtered);
        requestAnimationFrame(() => {
          const el = document.getElementById('user-center-chat-messages');
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    } catch {
    }
  };

  const handleSaveAddress = async () => {
    if (!String(addressPhone || '').trim()) return alert('请填写手机号');
    if (!String(addressDetail || '').trim()) return alert('请填写详细地址');
    const sessionToken = localStorage.getItem('user_session');
    if (!sessionToken) return alert('请先登录');

    try {
      const res = await fetch('/api/user/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          address: buildUserAddressPayload(addressName, addressPhone, addressDetail),
          sessionToken,
        }),
      });
      const data = await res.json();
      if (!data.success) return alert('保存失败');
      setIsAddressEditorOpen(false);
      window.location.reload();
    } catch {
      alert('网络错误');
    }
  };

  const openShopChat = (order?: any) => {
    const targetOrder = order || currentShopOrders[0] || null;
    if (targetOrder?.shop_id) {
      setChatShopId(Number(targetOrder.shop_id));
      const nextView = buildUserOrderView(targetOrder, shopMap);
      setChatShopName(nextView.shopName || currentShopName);
      setChatShopSlug(nextView.shopSlug || currentShopSlug);
    }
    if (targetOrder) {
      setSelectedOrder(targetOrder);
    }
    setIsServicePanelOpen(true);
    loadChatMessages();
  };

  useEffect(() => {
    if (!chatShopId && currentShopId) {
      setChatShopId(Number(currentShopId || 0));
      setChatShopName(currentShopName);
      setChatShopSlug(currentShopSlug);
    }
  }, [currentShopId, currentShopName, currentShopSlug, chatShopId]);

  useEffect(() => {
    if (isServicePanelOpen) {
      loadChatMessages();
    }
  }, [isServicePanelOpen, chatContext.shopId, chatContext.userPhone]);

  useEffect(() => {
    const openCustomerChat = () => openShopChat();
    window.addEventListener('open-customer-chat', openCustomerChat as EventListener);
    return () => window.removeEventListener('open-customer-chat', openCustomerChat as EventListener);
  }, [currentShopOrders.length, chatContext.shopId, chatContext.userPhone]);

  useEffect(() => {
    if (!openChatSignal) return;
    openShopChat();
  }, [openChatSignal]);

  useEffect(() => {
    if (!isServicePanelOpen || !chatContext.shopId || !chatContext.userPhone) return;

    ensureUserChatRealtime({
      shopId: chatContext.shopId,
      userPhone: chatContext.userPhone,
      onMessage(payload) {
        if (!payload || Number(payload.shop_id || 0) !== Number(chatContext.shopId)) return;
        setChatMessages((prev) => normalizeUserChatMessages([...(prev || []), payload], chatContext.shopId));
        requestAnimationFrame(() => {
          const el = document.getElementById('user-center-chat-messages');
          if (el) el.scrollTop = el.scrollHeight;
        });
      },
    });
  }, [isServicePanelOpen, chatContext.shopId, chatContext.userPhone]);


  const renderInteractiveOrderCard = (order: any, idx: number) => (
    <div style={{ cursor: 'default' }}>
      {renderOrderCard(order, idx, shopMap, openShopChat)}
    </div>
  );

  const selectedOrderDetail = selectedOrder ? buildOrderDetailState(selectedOrder) : null;
  const customerConversations = buildCustomerConversationList(allChatMessages as any[], shopMap as any);

  return (
    <div className="user-center">
      <style>{`
        @keyframes userCenterPopIn {
          from { opacity: 0; transform: translateY(14px) scale(.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div className="current-shop-card">
        <div className="current-shop-title">当前店铺</div>
        <div className="current-shop-name">{currentShopName}</div>
        <div className="current-shop-meta">{currentShopSlug ? `/${currentShopSlug}` : '未识别店铺 slug'}</div>
        <div className="shop-actions">
          <button className="shop-action-btn" onClick={onContinueShop}>返回本店继续下单</button>
          <button className="shop-action-btn" onClick={onViewAllOrders}>查看全部外卖订单</button>
        </div>
      </div>

      <div className="profile-quick-grid">
        <div className="profile-quick-card">
          <div className="profile-quick-title">当前地址摘要</div>
          <div className="profile-quick-value">{addressSummary}</div>
        </div>
        <div className="profile-quick-card">
          <div className="profile-quick-title">当前店铺权益</div>
          <div className="profile-quick-value">{membershipLabel || '暂无积分或 VIP 权益'}</div>
        </div>
      </div>

      {phoneConflictGuide && (
        <div className="profile-quick-card" style={{ marginBottom: '14px', borderColor: '#fecaca', background: '#fff1f2' }}>
          <div className="profile-quick-title" style={{ color: '#b91c1c' }}>{phoneConflictGuide.title}</div>
          <div className="profile-quick-value" style={{ color: '#7f1d1d' }}>{phoneConflictGuide.description}</div>
          <div style={{ marginTop: '10px' }}>
            <button className="tool-link-btn" style={{ background: '#fee2e2', color: '#b91c1c' }} onClick={onConflictLogin}>{phoneConflictGuide.actionLabel}</button>
          </div>
        </div>
      )}

      <div className="tool-link-row">
        <button className="tool-link-btn" style={{ boxShadow: '0 10px 20px rgba(55,48,163,.10)' }} onClick={() => setIsAddressEditorOpen(true)}>地址管理</button>
        <button className="tool-link-btn" style={{ boxShadow: '0 10px 20px rgba(55,48,163,.10)' }} onClick={() => setIsCouponPanelOpen(true)}>红包卡券</button>
        <button className="tool-link-btn" style={{ boxShadow: '0 10px 20px rgba(55,48,163,.10)' }} onClick={() => openShopChat()}>联系客服</button>
      </div>

      <div className="user-profile">
        <div className="user-info-row">
          <div className="user-avatar-circle">{userInfo?.name?.charAt(0) || 'U'}</div>
          <div>
            <div className="user-phone-num">{userInfo?.name || userInfo?.phone || '用户'}</div>
            <div className="user-subtitle">欢迎回来 / Dobrodošli</div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <span>账号: {userInfo?.login_account || userInfo?.phone || '-'}</span>
              <span>手机号: {userInfo?.phone || '未绑定'}</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
              <button className="shop-action-btn" onClick={onEditNickname}>修改昵称</button>
              <button className="shop-action-btn" onClick={onEditPhone}>修改手机号</button>
            </div>
          </div>
        </div>
        <button className="btn-logout-simple" onClick={onLogout}>退出 / Logout</button>
      </div>

      <div className="orders-tip">历史订单 / Istorija narudžbina</div>
      <div className="history-list">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>加载中...</div>
        ) : history.length === 0 ? (
          <div className="no-orders">📋 暂无历史订单</div>
        ) : (
          <>
            <div className="orders-section-block">
              <div className="orders-section-title">当前店铺订单</div>
              {currentShopOrders.length > 0 ? currentShopOrders.map(renderInteractiveOrderCard) : (
                <div style={{ background: '#fff7ed', border: '1px dashed #fdba74', color: '#9a3412', borderRadius: '12px', padding: '14px', fontSize: '13px', lineHeight: 1.7 }}>
                  {buildCurrentShopEmptyStateMessage(currentShopName)}
                </div>
              )}
            </div>
            {otherOrders.length > 0 && (
              <div className="orders-section-block">
                <div className="orders-section-title" style={{ color: '#475569' }}>其他店铺订单</div>
                {otherOrders.map(renderInteractiveOrderCard)}
              </div>
            )}
          </>
        )}
        {hasMoreHistory && <button className="btn-load-more" onClick={onLoadMore}>{isLoadingMore ? '加载中...' : '加载更多 / Više'}</button>}
      </div>

      {isAddressEditorOpen && (
        <div style={overlayPanelStyle} onClick={() => setIsAddressEditorOpen(false)}>
          <div style={overlayCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginBottom: '4px' }}>地址管理</div>
            <div style={{ color: '#64748b', fontSize: '13px', marginBottom: '16px' }}>修改后会同步到店铺内个人中心与 `/user` 页面。</div>
            <div style={{ display: 'grid', gap: '12px' }}>
              <input value={addressName} onInput={(e) => setAddressName((e.target as HTMLInputElement).value)} placeholder="联系人" style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
              <input value={addressPhone} onInput={(e) => setAddressPhone((e.target as HTMLInputElement).value)} placeholder="手机号" style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
              <textarea value={addressDetail} onInput={(e) => setAddressDetail((e.target as HTMLTextAreaElement).value)} placeholder="详细地址" rows={3} style={{ padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => setIsAddressEditorOpen(false)} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>取消</button>
              <button onClick={handleSaveAddress} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: '#ff4b33', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 18px rgba(255,75,51,.22)' }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {isCouponPanelOpen && (
        <div style={overlayPanelStyle} onClick={() => setIsCouponPanelOpen(false)}>
          <div style={overlayCardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginBottom: '14px' }}>{couponState.title}</div>
            <div style={{ color: '#64748b', lineHeight: 1.7, fontSize: '14px' }}>{couponState.description}</div>
            <div style={{ marginTop: '18px' }}>
              <button onClick={() => setIsCouponPanelOpen(false)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: '#ff4b33', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 18px rgba(255,75,51,.22)' }}>知道了</button>
            </div>
          </div>
        </div>
      )}

      {isServicePanelOpen && (
        <div style={overlayPanelStyle} onClick={() => setIsServicePanelOpen(false)}>
          <div style={{ ...overlayCardStyle, maxWidth: '860px', padding: '0', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ background: 'linear-gradient(145deg, #ff6b4a 0%, #ff8a5b 42%, #ffd36e 100%)', padding: '18px 20px', color: '#fff' }}>
              <div style={{ fontSize: '11px', opacity: 0.85, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase' }}>联系商家</div>
              <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '4px' }}>{chatContext.shopName}</div>
              <div style={{ fontSize: '12px', opacity: 0.88, marginTop: '4px' }}>{chatContext.shopSlug ? `/${chatContext.shopSlug}` : '当前店铺会话'}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '0', minHeight: '440px' }}>
              <div style={{ background: '#fff', borderRight: '1px solid #e5e7eb', padding: '12px', display: 'grid', gap: '8px', alignContent: 'start' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 800 }}>最近联系商家</div>
                {customerConversations.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '13px', lineHeight: 1.7 }}>暂无会话记录</div>
                ) : customerConversations.map((shop) => (
                  <button key={shop.shopId} type="button" onClick={() => {
                    setChatShopId(shop.shopId);
                    setChatShopName(shop.shopName);
                    setChatShopSlug(shop.shopSlug);
                    setSelectedOrder(null);
                    loadChatMessages();
                  }} style={{ width: '100%', textAlign: 'left', border: `1px solid ${chatShopId === shop.shopId ? '#60a5fa' : '#e5e7eb'}`, background: chatShopId === shop.shopId ? '#eff6ff' : '#fff', borderRadius: '12px', padding: '10px 12px', cursor: 'pointer', display: 'grid', gap: '4px' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{shop.shopName}</div>
                    <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shop.preview || '点击查看会话'}</div>
                  </button>
                ))}
              </div>

              <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#fff' }}>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', border: '1px solid #e5e7eb', borderRadius: '14px', background: '#fffaf7' }}>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 800 }}>当前会话商家</div>
                      <div style={{ fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{chatContext.shopName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{chatContext.shopSlug ? `/${chatContext.shopSlug}` : '当前店铺'}</div>
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>实时会话</span>
                  </div>

                  <div style={{ background: '#fffaf7', border: '1px solid #ffedd5', borderRadius: '14px', padding: '14px', display: 'grid', gap: '10px' }}>
                    <div style={{ fontSize: '12px', color: '#9a3412', fontWeight: 900 }}>订单协助信息</div>
                    {selectedOrderDetail ? (
                      <>
                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#0f172a' }}>#{selectedOrderDetail.orderNo}</div>
                        <div style={{ fontSize: '13px', color: '#475569' }}>{selectedOrderDetail.statusLabel} · {selectedOrderDetail.amount}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{selectedOrderDetail.createdAt}</div>
                        <div style={{ display: 'grid', gap: '6px', fontSize: '13px', color: '#334155' }}>
                          {selectedOrderDetail.items.slice(0, 3).map((item, idx) => <div key={idx}>• {item}</div>)}
                        </div>
                        {selectedOrderDetail.address ? <div style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6 }}>📍 {selectedOrderDetail.address}</div> : null}
                      </>
                    ) : (
                      <div style={{ color: '#9a3412', fontSize: '13px', lineHeight: 1.7 }}>你正在联系当前店铺。如需围绕某一单沟通，请先点击那张订单卡，再进入聊天。</div>
                    )}
                  </div>
                </div>
                <div id="user-center-chat-messages" style={{ flex: 1, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '12px', minHeight: '220px', maxHeight: '420px', overflowY: 'auto', display: 'grid', gap: '8px' }}>
                  {chatMessages.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '20px 8px' }}>暂无聊天记录，先发第一条消息吧。</div>
                  ) : chatMessages.map((msg, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.sender_role === 'user' ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth: '85%', background: msg.sender_role === 'user' ? '#ffedd5' : '#ffffff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: msg.sender_role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px', padding: '10px 12px', boxShadow: '0 6px 14px rgba(15,23,42,.04)' }}>
                        <div style={{ fontSize: '13px', lineHeight: 1.6 }}>{msg.message}</div>
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', padding: '0 4px' }}>{msg.created_at ? new Date(msg.created_at).toLocaleString('sr-RS', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input value={chatInput} onInput={(e) => setChatInput((e.target as HTMLInputElement).value)} placeholder="输入消息..." style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                  <button onClick={async () => {
                    const message = chatInput.trim();
                    if (!message || !chatContext.userPhone) return;
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
                    } catch {
                    }
                  }} style={{ padding: '12px 16px', borderRadius: '12px', border: 'none', background: '#ff4b33', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 18px rgba(255,75,51,.22)' }}>发送</button>
                </div>
                <button onClick={() => setIsServicePanelOpen(false)} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
