import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import {
  cartItems,
  cartTotal,
  addToCart,
  clearCart,
} from "../store/cartStore";
import GoogleLoginButton from "./GoogleLoginButton";
import {
  getUserInfo,
  clearUser as clearUserInfo,
} from "../lib/userStore";
import { SHOP_EVENTS } from "../lib/events";
import { loginUser, persistUserAuth, registerUser } from "../lib/user-auth";
import type { Order, User, CartItem } from "../types";
// import "../styles/user-modal.css"; 

/**
 * UserModal - 完美还原图3的个人中心界面
 * 包含：登录、历史订单卡片、数量控制、底部结算栏
 */
export default function UserModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [history, setHistory] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [orderQty, setOrderQty] = useState<Record<number, number>>({}); // 每个订单的加购数量

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

  const $total = useStore(cartTotal);

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
    const handleOpen = () => {
      setIsOpen(true);
    };
    window.addEventListener(SHOP_EVENTS.OPEN_USER_MODAL, handleOpen);
    (window as any).openUserCenter = () => setIsOpen(true);

    // 检查 URL 参数是否需要打开个人中心
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("open") === "user") {
      setIsOpen(true);
      // 清除参数避免刷新后重复打开
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }

    return () => window.removeEventListener(SHOP_EVENTS.OPEN_USER_MODAL, handleOpen);
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
        const newHistory = data.orders || data.history || [];

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
            data.user.password,
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
      const items = typeof (order as any).items_json === 'string' 
        ? JSON.parse((order as any).items_json) 
        : (order as any).items_json;
      
      const itemsArray = Array.isArray(items) ? items : Object.values(items || {});
      
      itemsArray.forEach((i: any) => {
        addToCart({
          id: i.id || Math.random(),
          name: i.name,
          sub_name: i.subName || i.sub_name || "",
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

  if (!isOpen) return null;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .user-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: flex-end;
          justify-content: center;
          z-index: 10000;
          animation: modalFadeIn 0.3s ease;
        }
        .user-modal-content {
          background: #fff;
          width: 100%;
          max-width: 500px;
          border-radius: 20px 20px 0 0;
          min-height: 70vh;
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          position: relative;
        }
        .modal-header {
          padding: 15px;
          display: flex;
          justify-content: flex-end;
        }
        .btn-close {
          border: none;
          background: #f1f5f9;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          font-size: 20px;
          cursor: pointer;
        }
        .modal-body {
          flex: 1;
          overflow-y: auto;
          padding: 0 15px 100px;
        }
        .history-order-card {
          background: #fff;
          border: 1px solid #edf2f7;
          border-radius: 12px;
          margin-bottom: 15px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .order-top {
          padding: 14px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 1px solid #f7fafc;
        }
        .user-profile {
          padding: 20px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .user-avatar-circle {
          width: 50px;
          height: 50px;
          background: #ff4b33;
          color: #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: bold;
          margin-right: 12px;
        }
        .user-phone-num { font-weight: 800; font-size: 18px; color: #1a202c; }
        .user-subtitle { font-size: 13px; color: #a0aec0; }
        .btn-logout-simple { border: 1px solid #e2e8f0; background: #fff; padding: 6px 12px; border-radius: 8px; font-size: 12px; cursor: pointer; }
        .orders-tip { font-weight: 800; font-size: 16px; margin: 10px 0 15px; color: #2d3748; }
        @keyframes modalFadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        
        .modal-footer-cart {
          position: absolute;
          bottom: 20px;
          left: 15px;
          right: 15px;
          height: 50px;
          background: #1a1a1a;
          border-radius: 25px;
          display: flex;
          align-items: center;
          padding: 0 20px;
          color: #fff;
          cursor: pointer;
          justify-content: space-between;
          box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }
        .cart-summary { display: flex; align-items: center; gap: 12px; }
        .cart-icon-wrapper { position: relative; font-size: 24px; }
        .cart-count { position: absolute; top: -5px; right: -8px; background: #ff4b33; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 10px; border: 2px solid #1a1a1a; }
        .cart-total-price { font-size: 18px; font-weight: 800; }
        .btn-checkout-go { font-weight: bold; color: #fff; }
      ` }} />
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
                  <button type="submit" className="btn-login-submit" style={{ padding: '13px 12px', borderRadius: '12px', background: '#ff4b33', color: '#fff', border: 'none', fontWeight: 'bold', boxShadow: '0 10px 22px rgba(255,75,51,0.22)' }}>{loading ? '加载中...' : (isRegisterMode ? '立即注册' : '立即登录')}</button>
                </form>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 0 12px', color: '#a0aec0', fontSize: '12px' }}>
                  <span style={{ flex: 1, height: '1px', background: '#edf2f7' }}></span>
                  <span>或使用 Google 登录 / Nastavite preko Google</span>
                  <span style={{ flex: 1, height: '1px', background: '#edf2f7' }}></span>
                </div>
                <GoogleLoginButton
                  onSuccess={() => {
                    setIsLoggedIn(true);
                    const currentUser = getUserInfo();
                    setUserInfo(currentUser as User);
                    if (currentUser.phone) {
                      fetchHistory(currentUser.phone);
                    }
                  }}
                  onError={(error) => setLoginError(error || 'Google 登录失败')}
                />
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
            <div className="user-center">
              {/* 用户信息头部 */}
              <div className="user-profile">
                <div className="user-info-row">
                  <div className="user-avatar-circle">
                    {userInfo?.name?.charAt(0) || "U"}
                  </div>
                  <div>
                    <div className="user-phone-num">
                      {userInfo?.name || userInfo?.phone || "用户"}
                    </div>
                    <div className="user-subtitle">
                      欢迎回来 / Dobrodošli
                    </div>
                  </div>
                </div>
                <button className="btn-logout-simple" onClick={handleLogout}>
                  退出 / Logout
                </button>
              </div>

              <div className="orders-tip">历史订单 / Istorija narudžbina</div>

              {/* 历史订单列表 */}
              <div className="history-list">
                {loading ? (
                  <div style={{ textAlign: "center", padding: "40px" }}>加载中...</div>
                ) : history.length === 0 ? (
                  <div className="no-orders">📋 暂无历史订单</div>
                ) : (
                  history.map((order, idx) => (
                    <div key={idx} className="history-order-card">
                      <div className="order-top">
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span style={{ fontSize: "12px", color: "#999" }}>#{order.order_no}</span>
                          <span style={{ fontSize: "16px", fontWeight: "bold" }}>取餐号: <span style={{ color: "#2196f3" }}>{order.order_no.slice(-3)}</span></span>
                        </div>
                        <span style={{ color: '#e53e3e', fontSize: '18px', fontWeight: '800' }}>
                          {Number(order.total_amount || 0).toLocaleString()} RSD
                        </span>
                      </div>

                      <div style={{ padding: '0 14px', fontSize: '11px', color: '#a0aec0' }}>
                        {new Date(order.created_at || '').toLocaleString('sr-RS', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      </div>

                      {/* 商品内容 */}
                      <div className="order-content" style={{ fontSize: '13px', color: '#4a5568', background: '#f8fafc', padding: '8px', borderRadius: '6px', margin: '8px 14px' }}>
                        {(() => {
                          try {
                            const items = typeof (order as any).items_json === 'string' 
                              ? JSON.parse((order as any).items_json) 
                              : (order as any).items_json;
                            const itemsArray = Array.isArray(items) ? items : Object.values(items || {});
                            return itemsArray.map((i: any, iIdx: number) => (
                              <div key={iIdx} style={{ marginBottom: '4px' }}>
                                • {i.name} <span style={{ color: '#718096', fontSize: '11px' }}>({i.subName || i.sub_name})</span> x{i.quantity}
                              </div>
                            ));
                          } catch (e) { return "商品解析失败"; }
                        })()}
                      </div>

                      {/* 配送信息 */}
                      {order.table_info && (
                        <div style={{ padding: '0 14px 8px', fontSize: '12px', color: '#718096' }}>
                          📍 {order.table_info}
                        </div>
                      )}

                      {/* 状态与骑手 */}
                      <div style={{ padding: '0 14px 14px' }}>
                        {order.status === "delivering" ? (
                          <div style={{ background: "#e3f2fd", color: "#1565c0", padding: "10px", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🛵</span>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: "bold", fontSize: "13px" }}>派送中 / Delivering</div>
                              {order.courier_name && <div style={{ fontSize: "12px", opacity: 0.8 }}>骑手: {order.courier_name} ({order.courier_phone})</div>}
                            </div>
                            {order.courier_phone && <a href={`tel:${order.courier_phone}`} style={{ background: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", textDecoration: "none", color: "#1565c0", border: "1px solid #1565c0" }}>拨打</a>}
                          </div>
                        ) : (
                          <span style={{ padding: "4px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: "bold", background: order.status === "pending" ? "#fff3e0" : order.status === "confirmed" ? "#e8f5e9" : "#f5f5f5", color: order.status === "pending" ? "#ef6c00" : order.status === "confirmed" ? "#2e7d32" : "#757575" }}>
                            {order.status === "pending" ? "等待接单 / Pending" : order.status === "confirmed" ? "商家已接单 / Confirmed" : order.status === "completed" ? "已送达 / Completed" : "订单已关闭"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {hasMoreHistory && (
                  <button className="btn-load-more" onClick={() => fetchHistory(userInfo?.phone || "", historyPage + 1, true)}>
                    {isLoadingMore ? "加载中..." : "加载更多 / Više"}
                  </button>
                )}
              </div>
            </div>
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
