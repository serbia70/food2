import { useEffect, useState } from 'preact/hooks';
import UserCenterPanel from './UserCenterPanel';
import { getUserInfo, clearUser as clearUserInfo } from '../lib/userStore';
import type { Order, User } from '../types';
import { buildUserOrderView, filterUserVisibleOrders, type UserOrderShopMap } from '../lib/user-order-view';
import { buildCurrentShopMembershipSummary, filterOrdersForCurrentShop } from '../lib/shop-scoped-orders';
import { applyLocalNicknameUpdate, buildPhoneUpdatePayload } from '../lib/user-profile-update';
import { mapUserUpdateErrorMessage } from '../lib/user-update-error';
import { buildPhoneConflictGuide } from '../lib/user-update-guide';

export default function UserCenterPageIsland() {
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [shopMap, setShopMap] = useState<UserOrderShopMap>({});
  const [currentShopName, setCurrentShopName] = useState('当前店铺');
  const [currentShopSlug, setCurrentShopSlug] = useState('');
  const [currentShopId, setCurrentShopId] = useState('');
  const [addressSummary, setAddressSummary] = useState('暂无地址，去地址管理补充');
  const [phoneConflictGuide, setPhoneConflictGuide] = useState<any>(null);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [initialChatOpen, setInitialChatOpen] = useState(false);
  const [historyPhone, setHistoryPhone] = useState('');
  const [chatReturnTo, setChatReturnTo] = useState('');
  const [pendingChatShopSlug, setPendingChatShopSlug] = useState('');
  const [pendingChatShopName, setPendingChatShopName] = useState('');
  const [pendingChatShopId, setPendingChatShopId] = useState('');

  const phoneLike = (value: any) => {
    const v = String(value || '').trim();
    if (!v) return '';
    if (/^\+?\d{1,20}$/.test(v)) return v;
    if (/^0\d{1,20}$/.test(v)) return v;
    return '';
  };

  const loadAddressPhone = async () => {
    const sessionToken = String(localStorage.getItem('user_session') || '').trim();
    if (!sessionToken) return '';

    try {
      const res = await fetch('/api/user/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', sessionToken }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!data?.success || !data?.address) return '';

      let addrObj: any = {};
      try {
        addrObj = JSON.parse(data.address);
        if (typeof addrObj !== 'object') throw new Error('invalid');
      } catch {
        addrObj = { phone: '' };
      }

      return phoneLike(addrObj.phone);
    } catch {
      return '';
    }
  };

  const fetchHistoryOnce = async (phone: string, page = 1, limit = 10) => {
    const clean = phoneLike(phone);
    if (!clean) return { orders: [] as any[], hasMore: false };

    const res = await fetch(`/api/user/history?phone=${encodeURIComponent(clean)}&page=${page}&limit=${limit}`);
    const data = await res.json().catch(() => ({} as any));
    if (!data?.success) return { orders: [] as any[], hasMore: false };

    const visible = filterUserVisibleOrders(data.orders || data.history || []);
    return { orders: visible, hasMore: Boolean(data.hasMore) };
  };

  const syncShopContextFromHistory = (orders: any[]) => {
    const sourceOrder = orders?.[0];
    if (!sourceOrder) return;
    const view = buildUserOrderView(sourceOrder as any, shopMap);
    setCurrentShopName(view.shopName || '当前店铺');
    setCurrentShopSlug(view.shopSlug || '');
    setCurrentShopId(String((sourceOrder as any)?.shop_id || (sourceOrder as any)?.restaurant_id || ''));
  };

  const loadHistoryWithFallback = async () => {
    const candidates = [phoneLike(userInfo?.phone), phoneLike((userInfo as any)?.login_account)];

    // If user logged in without a phone, try reading address phone via session token.
    const addrPhone = await loadAddressPhone();
    if (addrPhone) candidates.push(addrPhone);

    const primaryPhone = candidates.find(Boolean) || '';
    if (!primaryPhone) return;

    setLoading(true);
    try {
      let usedPhone = primaryPhone;
      let result = await fetchHistoryOnce(primaryPhone, 1, 10);

      for (const phone of candidates) {
        const clean = phoneLike(phone);
        if (!clean || clean === usedPhone) continue;
        if (result.orders.length) break;
        const alt = await fetchHistoryOnce(clean, 1, 10);
        if (alt.orders.length) {
          usedPhone = clean;
          result = alt;
          break;
        }
      }

      setHistoryPhone(usedPhone);
      setHistory(result.orders as any);
      setHasMoreHistory(Boolean(result.hasMore));
      syncShopContextFromHistory(result.orders);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreHistory = async () => {
    const phone = phoneLike(historyPhone || userInfo?.phone || (userInfo as any)?.login_account);
    if (!phone) return;

    setIsLoadingMore(true);
    try {
      const page = Math.floor(history.length / 10) + 1;
      const result = await fetchHistoryOnce(phone, page, 10);
      if (result.orders.length) {
        setHistory((prev) => ([...(prev || []), ...(result.orders as any)] as any));
      }
      setHasMoreHistory(Boolean(result.hasMore));
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    const user = getUserInfo();
    if (user.phone || user.login_account) {
      setUserInfo(user as User);
      setIsLoggedIn(true);
    }
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('openChat') === '1') {
        setInitialChatOpen(true);
        const shopSlugParam = url.searchParams.get('shop');
        const shopNameParam = url.searchParams.get('shopName');
        const shopIdParam = url.searchParams.get('shopId');
        const fromParam = url.searchParams.get('from');
        if (shopSlugParam) setCurrentShopSlug(shopSlugParam);
        if (shopNameParam) setCurrentShopName(shopNameParam);
        if (shopSlugParam) setPendingChatShopSlug(shopSlugParam);
        if (shopNameParam) setPendingChatShopName(shopNameParam);
        if (shopIdParam) setPendingChatShopId(shopIdParam);
        if (fromParam === 'orders') setChatReturnTo('/orders');
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    // When opening chat from /orders we might only have slug/name or shopId.
    // Convert to currentShopId so UserCenterPanel can bind the correct shop chat context.
    if (!initialChatOpen) return;
    if (currentShopId) return;

    const idFromQuery = String(pendingChatShopId || '').trim();
    if (idFromQuery) {
      setCurrentShopId(idFromQuery);
      if (pendingChatShopSlug) setCurrentShopSlug(pendingChatShopSlug);
      if (pendingChatShopName) setCurrentShopName(pendingChatShopName);
      return;
    }

    const slug = String(pendingChatShopSlug || '').trim();
    if (!slug) return;
    const match = Object.entries(shopMap || {}).find(([, ref]) => String(ref?.slug || '').trim() === slug);
    if (!match) return;
    setCurrentShopId(String(match[0] || ''));
    if (pendingChatShopName) setCurrentShopName(pendingChatShopName);
    setCurrentShopSlug(slug);
  }, [initialChatOpen, pendingChatShopId, pendingChatShopSlug, pendingChatShopName, currentShopId, Object.keys(shopMap).length]);

  useEffect(() => {
    const loadShopMap = async () => {
      try {
        const res = await fetch('/api/shop/list');
        if (!res.ok) return;
        const data = await res.json();
        const shops = Array.isArray(data?.shops) ? data.shops : [];
        const nextMap: UserOrderShopMap = {};
        shops.forEach((shop: any) => {
          const id = String(shop?.id || '').trim();
          if (!id) return;
          nextMap[id] = {
            id,
            name: String(shop?.name || '').trim(),
            slug: String(shop?.slug || '').trim(),
          };
        });
        setShopMap(nextMap);
      } catch {
      }
    };
    loadShopMap();
  }, []);

  useEffect(() => {
    if (!userInfo) return;
    loadHistoryWithFallback();
  }, [userInfo, Object.keys(shopMap).length]);

  useEffect(() => {
    const loadAddressSummary = async () => {
      const sessionToken = localStorage.getItem('user_session');
      if (!sessionToken) return;
      try {
        const res = await fetch('/api/user/address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get', sessionToken }),
        });
        const data = await res.json();
        if (!data.success || !data.address) return;
        let addrObj: any = {};
        try {
          addrObj = JSON.parse(data.address);
          if (typeof addrObj !== 'object') throw new Error('invalid');
        } catch {
          addrObj = { address: data.address };
        }
        setAddressSummary(`${addrObj.name || '联系人'}${addrObj.phone ? ` · ${addrObj.phone}` : ''}${addrObj.address ? ` · ${addrObj.address}` : ''}`);
      } catch {
      }
    };
    if (isLoggedIn) loadAddressSummary();
  }, [isLoggedIn]);

  const handleEditNickname = () => {
    const currentName = String(userInfo?.name || '');
    const nextName = window.prompt('请输入新的昵称', currentName);
    if (!nextName) return;
    const nextUser = applyLocalNicknameUpdate((userInfo || {}) as Record<string, any>, nextName);
    localStorage.setItem('food_order_user', JSON.stringify(nextUser));
    localStorage.setItem('user_info', JSON.stringify(nextUser));
    setUserInfo(nextUser as User);
  };

  const handleEditPhone = async () => {
    const currentPhone = String(userInfo?.phone || '');
    const nextPhone = window.prompt('请输入新的手机号', currentPhone);
    if (!nextPhone) return;
    try {
      const payload = buildPhoneUpdatePayload((userInfo || {}) as Record<string, any>, nextPhone);
      const res = await fetch('/api/user/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) {
        if (String(data?.error || '').trim().toLowerCase() === 'phone already in use') {
          setPhoneConflictGuide(buildPhoneConflictGuide(nextPhone));
        }
        alert(mapUserUpdateErrorMessage(data));
        return;
      }

      setPhoneConflictGuide(null);
      const nextUser = { ...(userInfo || {}), phone: nextPhone };
      localStorage.setItem('food_order_user', JSON.stringify(nextUser));
      localStorage.setItem('user_info', JSON.stringify(nextUser));
      setUserInfo(nextUser as User);
      setHistoryPhone(phoneLike(nextPhone));
      loadHistoryWithFallback();
    } catch {
      alert('网络错误');
    }
  };

  const handleLogout = () => {
    clearUserInfo();
    localStorage.removeItem('user_session');
    localStorage.removeItem('food_order_user');
    localStorage.removeItem('user_info');
    setUserInfo(null);
    setIsLoggedIn(false);
    window.location.href = '/user/login';
  };

  const currentShopMembership = buildCurrentShopMembershipSummary(
    filterOrdersForCurrentShop(history as any[], { id: currentShopId, slug: currentShopSlug }),
  );

  if (!isLoggedIn || !userInfo) {
    return (
      <div className="user-page-shell user-page-shell--guest">
        <section className="user-page-guest">
          <p className="user-page-eyebrow">Account Hub</p>
          <h1>请先登录</h1>
          <p>这里与店铺内个人中心使用同一套内容。登录后可查看订单、资料、地址、权益和优惠券。</p>
          <div className="user-page-actions">
            <a href="/user/login" className="user-page-primary">去登录</a>
            <a href="/user/login?mode=register" className="user-page-secondary">去注册</a>
          </div>
        </section>
        <div className="user-page-guest-note">未登录也可以浏览首页与店铺，登录后可同步订单与权益。</div>
        <style>{`
          .user-page-shell{height:100vh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:radial-gradient(circle at top left, rgba(0,177,64,.16), transparent 35%),radial-gradient(circle at 80% 10%, rgba(255,209,1,.14), transparent 32%),linear-gradient(180deg,#f7fbf7 0%,#eef6ef 100%);padding:18px 18px 96px}
          .user-page-guest{max-width:920px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:22px;padding:24px 22px;box-shadow:0 18px 36px rgba(15,23,42,.08)}
          .user-page-eyebrow{margin:0 0 8px;color:#047857;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
          .user-page-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
          .user-page-primary,.user-page-secondary{display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:999px;text-decoration:none;font-weight:700}
          .user-page-primary{background:#00b140;color:#fff}.user-page-secondary{background:#fff;color:#334155;border:1px solid #cbd5e1}
          .user-page-guest-note{max-width:920px;margin:12px auto 0;color:#64748b;font-size:12px;line-height:1.6;padding:0 4px}

        `}</style>
      </div>
    );
  }

  return (
    <div className="user-page-shell user-page-shell--page">
      <header className="user-page-appbar">
        <div className="user-page-appbar-inner">
          <div className="user-page-title">
            <div className="user-page-title-eyebrow">Account</div>
            <div className="user-page-title-main">个人中心</div>
          </div>
          <div className="user-page-appbar-actions">
            <a className="user-page-appbar-link" href="/">返回首页</a>
          </div>
        </div>
      </header>

      <main className="user-page-main" role="main">
        <div className="user-page-container">
          <UserCenterPanel
            variant="page"
            userInfo={userInfo}
            currentShopName={currentShopName}
            currentShopSlug={currentShopSlug}
            currentShopId={currentShopId}
            addressSummary={addressSummary}
            membershipLabel={currentShopMembership.label || '暂无积分或 VIP 权益'}
            history={history as any[]}
            shopMap={shopMap}
            loading={loading}
            hasMoreHistory={hasMoreHistory}
            isLoadingMore={isLoadingMore}
            phoneConflictGuide={phoneConflictGuide}
            onContinueShop={() => {
              if (currentShopSlug) window.location.href = `/${currentShopSlug}`;
              else window.location.href = '/';
            }}
            onViewAllOrders={() => (window.location.href = '/orders')}
            onManageAddress={() => (window.location.href = '/user/address')}
            onCoupons={() => (window.location.href = '/user/coupon')}
            onService={() => (window.location.href = '/user/service')}
            onEditNickname={handleEditNickname}
            onEditPhone={handleEditPhone}
            onLogout={handleLogout}
              onConflictLogin={() => {
                if (!phoneConflictGuide?.loginHref) return;
                handleLogout();
                window.location.href = phoneConflictGuide.loginHref;
              }}
            onLoadMore={loadMoreHistory}
            initialChatOpen={initialChatOpen}
            onServiceClose={() => {
              if (chatReturnTo) {
                window.location.href = chatReturnTo;
                return;
              }
              try {
                window.history.replaceState({}, '', '/user');
              } catch {
              }
            }}
          />
        </div>
      </main>

      <style>{`
        .user-page-shell{height:100vh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:radial-gradient(circle at 12% 0%, rgba(0,177,64,.16), transparent 38%),radial-gradient(circle at 86% 12%, rgba(255,209,1,.12), transparent 36%),linear-gradient(180deg,#f7fbf7 0%,#eef6ef 100%);padding:0}

        .user-page-appbar{position:sticky;top:0;z-index:30;background:rgba(247,251,247,.82);backdrop-filter:saturate(140%) blur(10px);border-bottom:1px solid rgba(226,232,240,.9)}
        .user-page-appbar-inner{max-width:1160px;margin:0 auto;display:flex;align-items:flex-end;justify-content:space-between;gap:14px;padding:14px 16px}
        .user-page-title-eyebrow{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#047857;opacity:.95}
        .user-page-title-main{font-size:18px;font-weight:900;color:#0f172a;line-height:1.1;margin-top:2px}
        .user-page-appbar-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
        .user-page-appbar-link{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border-radius:999px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;text-decoration:none;font-weight:800;font-size:12px;box-shadow:0 10px 20px rgba(15,23,42,.05)}
        .user-page-appbar-link:active{transform:translateY(1px)}

        .user-page-main{padding:14px 0 96px}
        .user-page-container{max-width:1160px;margin:0 auto;padding:0 16px}

        @media (min-width:768px){
          .user-page-appbar-inner{padding:16px 20px}
          .user-page-container{padding:0 20px}
          .user-page-title-main{font-size:20px}
        }
      `}</style>
    </div>
  );
}
