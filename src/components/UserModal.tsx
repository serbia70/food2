import { useMemo, useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import {
  cartItems,
  addToCart,
  clearCart,
  getCartTotals,
  type SpecialPromotion,
} from "../store/cartStore";
import {
  getUserInfo,
  clearUser as clearUserInfo,
} from "../lib/userStore";
import { SHOP_EVENTS } from "../lib/events";
import { loginUser, persistUserAuth, registerUser } from "../lib/user-auth";
import type { Order, User, CartItem } from "../types";
import { buildUserOrderView, filterUserVisibleOrders, type UserOrderShopMap } from "../lib/user-order-view";
import { resolveCurrentShopContext } from "../lib/current-shop-context";
import { buildCurrentShopEmptyStateMessage, buildCurrentShopMembershipSummary, filterOrdersForCurrentShop, splitOrdersByCurrentShop } from "../lib/shop-scoped-orders";
import { applyLocalNicknameUpdate, buildPhoneUpdatePayload } from "../lib/user-profile-update";
import { mapUserUpdateErrorMessage } from "../lib/user-update-error";
import { buildPhoneConflictGuide } from "../lib/user-update-guide";
import { validateUserLoginInput } from "../lib/user-login-validation";
import UserCenterPanel from "./UserCenterPanel";
// import "../styles/user-modal.css"; 

/**
 * UserModal - 完美还原图3的个人中心界面
 * 包含：登录、历史订单卡片、数量控制、底部结算栏
 */
interface UserModalProps {
  specialPromotionMap?: Record<string, SpecialPromotion>;
}

export default function UserModal({ specialPromotionMap = {} }: UserModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [shopMap, setShopMap] = useState<UserOrderShopMap>({});
  const [currentShopName, setCurrentShopName] = useState("当前店铺");
  const [currentShopSlug, setCurrentShopSlug] = useState("");
  const [currentShopId, setCurrentShopId] = useState("");
  const [addressSummary, setAddressSummary] = useState("暂无地址，去地址管理补充");
  const [phoneConflictGuide, setPhoneConflictGuide] = useState<null | { title: string; description: string; actionLabel: string }>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [orderQty, setOrderQty] = useState<Record<number, number>>({}); // 每个订单的加购数量
  const [openChatSignal, setOpenChatSignal] = useState(0);

  const [loginAccount, setLoginAccount] = useState("");
  const [password, setPassword] = useState("");
  const [userInfo, setUserInfo] = useState<User | null>(null);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [loginError, setLoginError] = useState("");

  const [regAccountType, setRegAccountType] = useState<
    "phone" | "email" | "id"
  >("phone");
  const [regAccount, setRegAccount] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regError, setRegError] = useState("");

  const $items = useStore(cartItems);
  const $total = useMemo(() => getCartTotals($items, specialPromotionMap), [$items, specialPromotionMap]);

  const checkLogin = () => {
    const user = getUserInfo();
    if (user.phone || user.login_account) {
      setIsLoggedIn(true);
      setUserInfo(user);
      setLoginAccount(user.phone || user.login_account || "");

      if (user.phone) {
        fetchHistory(user.phone);
      }
    } else {
      setIsLoggedIn(false);
      setUserInfo(null);
    }
  };

  useEffect(() => {
    if (isOpen) checkLogin();
  }, [isOpen]);

  useEffect(() => {
    let active = true;

    const loadShopMap = async () => {
      const fallbackSlug = String(window.location.pathname || '').replace(/^\//, '').split('/')[0] || '';

      try {
        const res = await fetch('/api/shop/list');
        if (!res.ok) throw new Error('shop list failed');
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

        if (active) {
          setShopMap(nextMap);
          const shopContext = resolveCurrentShopContext(window.location.pathname, nextMap);
          setCurrentShopSlug(shopContext.slug || fallbackSlug);
          setCurrentShopName(shopContext.name || (fallbackSlug ? `${fallbackSlug}号店` : '当前店铺'));
          setCurrentShopId(shopContext.id || '');
        }
      } catch {
        if (active) {
          setShopMap({});
          setCurrentShopSlug(fallbackSlug);
          setCurrentShopName(fallbackSlug ? `${fallbackSlug}号店` : '当前店铺');
          setCurrentShopId('');
        }
      }
    };

    loadShopMap();
    return () => {
      active = false;
    };
  }, []);

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

    if (isOpen && isLoggedIn) {
      loadAddressSummary();
    }
  }, [isOpen, isLoggedIn]);

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
    };
    const handleCloseForShopChat = () => {
      // 独立聊天层打开时，强制关闭个人中心，避免出现双层关闭
      setIsOpen(false);
    };
    window.addEventListener(SHOP_EVENTS.OPEN_USER_MODAL, handleOpen);
    window.addEventListener(SHOP_EVENTS.OPEN_SHOP_CHAT_MODAL, handleCloseForShopChat);
    (window as any).openUserCenter = () => setIsOpen(true);

    // 检查 URL 参数是否需要打开个人中心
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("open") === "user") {
      setIsOpen(true);
      // 清除参数避免刷新后重复打开
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }

    return () => {
      window.removeEventListener(SHOP_EVENTS.OPEN_USER_MODAL, handleOpen);
      window.removeEventListener(SHOP_EVENTS.OPEN_SHOP_CHAT_MODAL, handleCloseForShopChat);
    };
  }, []);

  const fetchHistory = async (phone: string, page = 1, isAppend = false) => {
    if (!phone) return;
    if (isAppend) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(
        `/api/user/history?phone=${phone}&page=${page}&limit=10`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );
      const data = await res.json();
      if (data.success) {
        const sourceHistory = data.orders || data.history || [];
        const visibleHistory = filterUserVisibleOrders(sourceHistory);
        const currentShopHistory = filterOrdersForCurrentShop(visibleHistory, {
          id: currentShopId,
          slug: currentShopSlug,
        });
        const newHistory = currentShopHistory.length > 0 ? currentShopHistory : visibleHistory;

        if (isAppend) {
          setHistory((prev) => [...prev, ...newHistory]);
        } else {
          setHistory(newHistory);
        }

        setHasMoreHistory(data.hasMore || false);
        setHistoryPage(page);
        setIsLoggedIn(true);

        setOrderQty((prev) => {
          const newQty = { ...prev };
          const startIdx = isAppend ? history.length : 0;
          newHistory.forEach((_: any, i: number) => {
            newQty[startIdx + i] = 0;
          });
          return newQty;
        });

        const currentUser = getUserInfo();
        if (!currentUser.phone && data.user) {
          saveUserInfo(
            data.user.name,
            data.user.phone,
            undefined,
            data.user.last_address,
          );
          setUserInfo(data.user);
        }
      }
    } catch (e) {
      console.error("Fetch history failed", e);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  };

  const handleLogin = async (e: any) => {
    e.preventDefault();
    const validationError = validateUserLoginInput(loginAccount, password);
    if (validationError) {
      setLoginError(validationError);
      return;
    }
    setLoading(true);
    setLoginError("");
    try {
      const data = await loginUser({ loginAccount, password });
      if (data.success) {
        const auth = persistUserAuth(data, { loginAccount, password });
        setIsLoggedIn(true);
        setUserInfo(auth.user as User);
        fetchHistory(auth.user.phone || loginAccount);
      } else {
        setLoginError(data.error || "登录失败 / Prijava nije uspela");
      }
    } catch (e) {
      setLoginError("网络错误 / Greška na mreži");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: any) => {
    e.preventDefault();
    setLoading(true);
    setRegError("");
    try {
      const data = await registerUser({
        accountType: regAccountType,
        account: regAccount,
        password: regPassword,
        name: regName,
      });
      if (data.success) {
        const auth = persistUserAuth(data, {
          accountType: regAccountType,
          account: regAccount,
          password: regPassword,
          name: regName,
        });
        setIsLoggedIn(true);
        setUserInfo(auth.user as User);
        setIsRegisterMode(false);
        fetchHistory(auth.user.phone || regAccount);
      } else {
        setRegError(data.error || "注册失败 / Registracija nije uspela");
      }
    } catch (e) {
      setRegError("网络错误 / Greška na mreži");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearUserInfo();
    setIsLoggedIn(false);
    setUserInfo(null);
    setHistory([]);
    setLoginAccount("");
    setPassword("");
  };

  const handleAddToCart = (order: Order, idx: number) => {
    try {
      const items = typeof (order as any).itemsJson === 'string'
        ? JSON.parse((order as any).itemsJson)
        : (order as any).itemsJson;

      const itemsArray = Array.isArray(items) ? items : Object.values(items || {});

      itemsArray.forEach((i: any) => {
        addToCart({
          id: i.id || Math.random(),
          name: i.name,
          subName: i.subName || "",
          price: i.price,
          img: i.img || "",
        });
      });

      setOrderQty((prev) => ({ ...prev, [idx]: (prev[idx] || 0) + 1 }));
    } catch (e) {
      console.error("Add order items failed", e);
    }
  };

  const adjustQty = (idx: number, delta: number) => {
    const newQty = Math.max(0, (orderQty[idx] || 0) + delta);
    setOrderQty((prev) => ({ ...prev, [idx]: newQty }));
    // 实际项目中这里可能需要更复杂的购物车同步逻辑，暂时只做展示
  };

  const handleCheckout = () => {
    setIsOpen(false);
    // 触发购物车弹窗
    const event = new CustomEvent(SHOP_EVENTS.OPEN_CART);
    window.dispatchEvent(event);
  };

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

  if (!isOpen) return null;

  return (
    <>
      <div className="user-modal-overlay" onClick={() => setIsOpen(false)}>
      <div className="user-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <button className="btn-close" onClick={() => setIsOpen(false)}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {!isLoggedIn ? (
            /* 登录/注册逻辑保持不变 */
            <div className="auth-container">
              {/* ... (此处略去登录注册UI代码以节省空间，但保持逻辑完整) ... */}
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <h2 style={{ marginBottom: '8px', fontSize: '26px', fontWeight: 800, color: '#1a202c' }}>
                  {isRegisterMode ? '注册 / Registracija' : '登录 / Prijava'}
                </h2>
                <div style={{ marginBottom: '20px', color: '#718096', fontSize: '14px', lineHeight: 1.5 }}>
                  {isRegisterMode
                    ? '创建账号，快速开始点餐 / Napravite nalog za brzu porudzbinu'
                    : '登录以继续点餐 / Prijavite se da nastavite'}
                </div>
                {isRegisterMode && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                    {([
                      ['phone', '手机号'],
                      ['email', '邮箱'],
                      ['id', 'ID'],
                    ] as const).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setRegAccountType(type)}
                        style={{
                          flex: 1,
                          padding: '10px 0',
                          borderRadius: '10px',
                          border: regAccountType === type ? '1px solid #ff4b33' : '1px solid #e2e8f0',
                          background: regAccountType === type ? '#fff1ed' : '#fff',
                          color: regAccountType === type ? '#ff4b33' : '#4a5568',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <form onSubmit={isRegisterMode ? handleRegister : handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {isRegisterMode && (
                    <input
                      type="text"
                      placeholder="姓名 / Ime"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
                    />
                  )}
                  <input
                    type="text"
                    placeholder={
                      isRegisterMode
                        ? regAccountType === 'phone'
                          ? '手机号 / Telefon'
                          : regAccountType === 'email'
                            ? '邮箱 / Email'
                            : '自定义 ID / Korisnicki ID'
                        : '手机号 / Telefon'
                    }
                    value={isRegisterMode ? regAccount : loginAccount}
                    onChange={(e) => isRegisterMode ? setRegAccount(e.target.value) : setLoginAccount(e.target.value)}
                    style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }}
                  />
                  <input type="password" placeholder="密码 / Lozinka" value={isRegisterMode ? regPassword : password} onChange={(e) => isRegisterMode ? setRegPassword(e.target.value) : setPassword(e.target.value)} style={{ padding: '12px', borderRadius: '8px', border: '1px solid #ddd' }} />
                  <button
                    type="button"
                    className="btn-login-submit"
                    onClick={(e) => (isRegisterMode ? handleRegister(e) : handleLogin(e))}
                    style={{ padding: '13px 12px', borderRadius: '12px', background: '#ff4b33', color: '#fff', border: 'none', fontWeight: 'bold', boxShadow: '0 10px 22px rgba(255,75,51,0.22)' }}
                  >
                    {loading ? '加载中...' : (isRegisterMode ? '立即注册' : '立即登录')}
                  </button>
                </form>
                {(loginError || regError) && (
                  <div style={{ color: '#e53e3e', marginTop: '12px', fontSize: '13px' }}>
                    {loginError || regError}
                  </div>
                )}
                <div style={{ marginTop: '18px', color: '#666', fontSize: '14px' }}>
                  {isRegisterMode ? '已有账号？' : '还没有账号？'}
                  <span onClick={() => setIsRegisterMode(!isRegisterMode)} style={{ color: '#2196f3', cursor: 'pointer', marginLeft: '5px', fontWeight: 700 }}>
                    {isRegisterMode ? '去登录' : '去注册'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <UserCenterPanel
              userInfo={userInfo}
              currentShopName={currentShopName}
              currentShopSlug={currentShopSlug}
              currentShopId={currentShopId}
              addressSummary={addressSummary}
              membershipLabel={buildCurrentShopMembershipSummary(history).label || '暂无积分或 VIP 权益'}
              history={history as any[]}
              shopMap={shopMap}
              loading={loading}
              hasMoreHistory={hasMoreHistory}
              isLoadingMore={isLoadingMore}
              phoneConflictGuide={phoneConflictGuide}
              onContinueShop={() => setIsOpen(false)}
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
              onLoadMore={() => fetchHistory(userInfo?.phone || '', historyPage + 1, true)}
              openChatSignal={openChatSignal}
            />
          )}
        </div>

        {/* 底部结算栏 */}
        {$total.count > 0 && (
          <div className="modal-footer-cart" onClick={handleCheckout}>
            <div className="cart-summary">
              <div className="cart-icon-wrapper">
                <span className="cart-count">{$total.count}</span>
                🍔
              </div>
              <div className="cart-total-price">
                {$total.price.toLocaleString()} <small>RSD</small>
              </div>
            </div>
            <div className="btn-checkout-go">去结算 / Plati {'>'}</div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
