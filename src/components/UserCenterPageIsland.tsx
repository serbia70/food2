import { useEffect, useState } from 'preact/hooks';
import Layout from '../layouts/Layout.astro';
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

  const fetchHistory = async (phone: string, page = 1, isAppend = false) => {
    if (!phone) return;
    if (isAppend) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/user/history?phone=${phone}&page=${page}&limit=10`);
      const data = await res.json();
      if (data.success) {
        const visibleHistory = filterUserVisibleOrders(data.orders || data.history || []);
        const nextHistory = isAppend ? [...history, ...visibleHistory] : visibleHistory;
        setHistory(nextHistory);
        setHasMoreHistory(data.hasMore || false);

        const sourceOrder = nextHistory[0];
        if (sourceOrder) {
          const view = buildUserOrderView(sourceOrder as any, shopMap);
          setCurrentShopName(view.shopName || '当前店铺');
          setCurrentShopSlug(view.shopSlug || '');
          setCurrentShopId(String((sourceOrder as any)?.shop_id || (sourceOrder as any)?.restaurant_id || ''));
        }
      }
    } finally {
      setLoading(false);
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
        if (shopSlugParam) setCurrentShopSlug(shopSlugParam);
        if (shopNameParam) setCurrentShopName(shopNameParam);
      }
    } catch {
    }
  }, []);

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
    if (userInfo?.phone) {
      fetchHistory(userInfo.phone);
    }
  }, [userInfo?.phone, Object.keys(shopMap).length]);

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
      fetchHistory(nextPhone);
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
      <div className="user-page-shell">
        <section className="user-page-guest">
          <p className="user-page-eyebrow">Account Hub</p>
          <h1>请先登录</h1>
          <p>这里与店铺内个人中心使用同一套内容。登录后可查看订单、资料、地址、权益和优惠券。</p>
          <div className="user-page-actions">
            <a href="/user/login" className="user-page-primary">去登录</a>
            <a href="/user/login?mode=register" className="user-page-secondary">去注册</a>
          </div>
        </section>
        <style>{`
          .user-page-shell{min-height:100vh;background:radial-gradient(circle at top left, rgba(0,177,64,.14), transparent 28%),linear-gradient(180deg,#f8fbf8 0%,#eef4ef 100%);padding:18px}
          .user-page-guest{max-width:880px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:24px;padding:24px;box-shadow:0 18px 32px rgba(15,23,42,.06)}
          .user-page-eyebrow{margin:0 0 8px;color:#047857;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
          .user-page-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
          .user-page-primary,.user-page-secondary{display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:999px;text-decoration:none;font-weight:700}
          .user-page-primary{background:#00b140;color:#fff}.user-page-secondary{background:#fff;color:#334155;border:1px solid #cbd5e1}
        `}</style>
      </div>
    );
  }

  return (
    <div className="user-page-shell">
      <div className="user-page-overlay-shell">
        <div className="user-page-content-shell">
          <div className="page-modal-header">
            <button className="page-modal-close" onClick={() => (window.location.href = currentShopSlug ? `/${currentShopSlug}` : '/')}>×</button>
          </div>
          <div className="page-modal-body">
            <UserCenterPanel
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
        onLoadMore={() => fetchHistory(userInfo?.phone || '', Math.floor(history.length / 10) + 1, true)}
        initialChatOpen={initialChatOpen}
      />
          </div>
        </div>
      </div>
      <style>{`
        .user-page-shell{min-height:100vh;background:rgba(15,23,42,.72);padding:0}
        .user-page-overlay-shell{min-height:100vh;display:flex;align-items:flex-end;justify-content:center}
        .user-page-content-shell{background:#fff;width:100%;max-width:880px;border-radius:24px 24px 0 0;min-height:86vh;max-height:96vh;display:flex;flex-direction:column;overflow:hidden;position:relative;box-shadow:0 24px 48px rgba(15,23,42,.22)}
        .page-modal-header{padding:15px;display:flex;justify-content:flex-end}
        .page-modal-close{border:none;background:#f1f5f9;width:32px;height:32px;border-radius:50%;font-size:20px;cursor:pointer}
        .page-modal-body{flex:1;overflow-y:auto;padding:0 18px 110px}
        .user-page-shell .history-list{padding-bottom:24px}
        @media (min-width:768px){.user-page-overlay-shell{align-items:center;padding:24px}.user-page-content-shell{border-radius:28px;min-height:min(880px,92vh);max-height:92vh;width:min(880px,100%)}.page-modal-body{padding:0 24px 118px}}
      `}</style>
    </div>
  );
}
