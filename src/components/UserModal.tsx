import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { clearUser, getUserInfo, saveUserInfo } from "../lib/userStore";
import { addToCart, removeOne, cartTotal } from "../store/cartStore";
import { DEFAULT_USER_PASSWORD } from "../lib/clientConfig";
import GoogleLoginButton from "./GoogleLoginButton";

interface OrderItem {
  id: string | number;
  name: string;
  subName?: string;
  sub_name?: string;
  price: number;
  quantity?: number;
  img?: string;
  image?: string;
  title?: string;
  product_id?: string | number;
}

interface Order {
  id: number;
  order_no?: string;
  total: number;
  items: OrderItem[];
  itemsText?: string;
  status: string;
  date?: string;
  deliveryInfo?: string;
}

interface User {
  name?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  password?: string;
  last_address?: string;
  addresses?: string[];
  google_id?: string;
}

interface GoogleUser {
  id: string;
  name: string;
  email: string;
  avatar: string;
  phone?: string;
}

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
    const handleOpen = () => setIsOpen(true);
    window.addEventListener("open-user-modal", handleOpen);
    return () => window.removeEventListener("open-user-modal", handleOpen);
  }, []);

  const fetchHistory = async (phone: string, page = 1, isAppend = false) => {
    if (!phone) return;
    if (isAppend) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const res = await fetch(
        `/api/user/history?phone=${phone}&page=${page}&limit=10`,
        {
          method: "GET", // 改为 GET 并带参数，因为我们后端已支持 GET 分页
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

        // 初始化加购数量（为新加载的订单设置索引，注意这里的索引计算）
        setOrderQty((prev) => {
          const newQty = { ...prev };
          const startIdx = isAppend ? history.length : 0;
          newHistory.forEach((_: any, i: number) => {
            newQty[startIdx + i] = 0;
          });
          return newQty;
        });

        // 更新本地存储（如果之前没有）
        const currentUser = getUserInfo();
        if (!currentUser.phone && data.user) {
          saveUserInfo(
            data.user.name,
            data.user.phone,
            data.user.password,
            data.user.last_address,
          );
          setUserInfo(getUserInfo());
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
    setIsLoadingMore(false);
  };

  const loadMoreHistory = () => {
    if (userInfo?.phone) {
      fetchHistory(userInfo.phone, historyPage + 1, true);
    }
  };

  // Google 登录成功回调
  const handleGoogleSuccess = (user: GoogleUser) => {
    // user 包含: id, name, email, avatar, phone(可能为空)
    saveUserInfo(user.name, user.phone || "", DEFAULT_USER_PASSWORD, "", {
      email: user.email,
      avatar: user.avatar,
      google_id: user.id,
    });

    setUserInfo(getUserInfo());
    setIsLoggedIn(true);

    // 如果该 Google 账号已绑定手机号，拉取历史订单
    if (user.phone) {
      fetchHistory(user.phone);
    }
  };

  // 获取订单的商品数组（保证格式正确）
  const getOrderProducts = (order: Order) => {
    if (!order.items || !Array.isArray(order.items)) return [];
    return order.items.map((item, i) => ({
      id: item.id || item.product_id || `order_item_${order.id}_${i}`,
      name: item.name || item.title || "商品",
      subName: item.subName || item.sub_name || "",
      price: item.price || 0,
      img: item.img || item.image || "",
      quantity: 1, // Default quantity for adding to cart
    }));
  };

  // 调整订单加购数量 - 真正添加/移除购物车
  const adjustQty = (idx: number, delta: number) => {
    const order = history[idx];
    const products = getOrderProducts(order);

    if (delta > 0) {
      // 增加：添加订单中的所有商品到购物车
      products.forEach((product) => addToCart(product));
    } else if (delta < 0) {
      // 减少：从购物车移除订单中的所有商品
      products.forEach((product) => removeOne(product.id));
    }

    setOrderQty((prev) => {
      const current = prev[idx] || 0;
      const newQty = Math.max(0, current + delta);
      return { ...prev, [idx]: newQty };
    });
  };

  // 添加到购物车（初次点击+号）
  const handleAddToCart = (order: Order, idx: number) => {
    const products = getOrderProducts(order);
    // 添加1份订单到购物车
    products.forEach((product) => addToCart(product));
    // 点击后显示数量+1
    setOrderQty((prev) => ({ ...prev, [idx]: (prev[idx] || 0) + 1 }));
  };

  // 跳转购物车
  const goToCart = () => {
    setIsOpen(false);
    setTimeout(() => {
      window.dispatchEvent(new Event("open-cart"));
    }, 100);
  };

  // 登录处理
  const handleLogin = async () => {
    if (!loginAccount || !password) {
      setLoginError("请输入账号和密码");
      return;
    }
    setLoading(true);
    setLoginError("");

    try {
      const res = await fetch("/api/user/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login_account: loginAccount, password }),
      });
      const data = await res.json();
      if (data.success) {
        saveUserInfo(
          data.user.name,
          data.user.phone || loginAccount,
          password,
          data.user.last_address,
          {
            email: data.user.email,
            avatar: data.user.avatar,
            login_account: loginAccount,
          },
        );
        setIsLoggedIn(true);
        setUserInfo(getUserInfo());
        setHistory(data.orders);
        setHasMoreHistory(data.hasMore);
      } else {
        setLoginError(data.error || "登录失败");
      }
    } catch (e: any) {
      setLoginError(e.message || "网络错误");
    }
    setLoading(false);
  };

  // 注册处理
  const handleRegister = async () => {
    if (!regAccount || !regPassword || !regName) {
      setRegError("请填写所有信息");
      return;
    }
    setLoading(true);
    setRegError("");

    try {
      const res = await fetch("/api/user/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_type: regAccountType,
          account: regAccount,
          password: regPassword,
          name: regName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        saveUserInfo(
          regName,
          regAccountType === "phone" ? regAccount : "",
          regPassword,
          "",
          { login_account: regAccount },
        );
        setIsLoggedIn(true);
        setUserInfo(getUserInfo());
      } else {
        setRegError(data.error || "注册失败");
      }
    } catch (e: any) {
      setRegError(e.message || "网络错误");
    }
    setLoading(false);
  };

  // 退出登录
  const handleLogout = () => {
    clearUser();
    setIsLoggedIn(false);
    setUserInfo(null);
    setHistory([]);
    setOrderQty({});
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <div className="user-modal">
        {/* 头部 */}
        <div className="modal-header">
          <h2>Moj Nalog / 个人中心</h2>
          <button className="modal-close" onClick={() => setIsOpen(false)}>
            ×
          </button>
        </div>

        {/* ===== 未登录状态 ===== */}
        {!isLoggedIn ? (
          <div className="modal-content">
            <div className="user-login-box" style={{ textAlign: "center" }}>
              {!isRegisterMode ? (
                <>
                  <h3 style={{ margin: "0 0 10px", fontSize: "18px" }}>
                    Prijava / 账号登录
                  </h3>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginBottom: "20px",
                    }}
                  >
                    Google 账号点一下头像即可一键完成
                  </p>
                </>
              ) : (
                <>
                  <h3 style={{ margin: "0 0 10px", fontSize: "18px" }}>
                    Registracija / 快速注册
                  </h3>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#666",
                      marginBottom: "20px",
                    }}
                  >
                    可使用 ID、邮箱或手机号注册
                  </p>
                </>
              )}

              {/* 1. Google 登录 (推荐) */}
              <div
                style={{
                  marginBottom: "20px",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <GoogleLoginButton
                  onSuccess={handleGoogleSuccess}
                  onError={(msg: string) => alert(msg)}
                />
              </div>

              <div
                className="divider"
                style={{
                  display: "flex",
                  alignItems: "center",
                  margin: "20px 0",
                  color: "#999",
                  fontSize: "12px",
                }}
              >
                <span
                  style={{ flex: 1, height: "1px", background: "#eee" }}
                ></span>
                <span style={{ padding: "0 10px" }}>更多方式 / Ostalo</span>
                <span
                  style={{ flex: 1, height: "1px", background: "#eee" }}
                ></span>
              </div>

              {/* 2. 账号登录/注册 */}
              {!isRegisterMode ? (
                <>
                  <input
                    type="text"
                    className="input-box"
                    placeholder="账号 (ID/邮箱/手机号)"
                    style={{ marginBottom: "10px" }}
                    value={loginAccount}
                    onInput={(e) =>
                      setLoginAccount((e.target as HTMLInputElement).value)
                    }
                  />
                  <input
                    type="password"
                    className="input-box"
                    placeholder="密码 / Password"
                    style={{ marginBottom: "10px" }}
                    value={password}
                    onInput={(e) =>
                      setPassword((e.target as HTMLInputElement).value)
                    }
                  />
                  {loginError && (
                    <div
                      style={{
                        color: "#f56565",
                        fontSize: "12px",
                        marginBottom: "10px",
                      }}
                    >
                      {loginError}
                    </div>
                  )}
                  <button
                    className="btn-full-green"
                    onClick={handleLogin}
                    disabled={loading}
                  >
                    {loading ? "..." : "登录 / Login"}
                  </button>
                </>
              ) : (
                <>
                  <div
                    style={{
                      marginBottom: "10px",
                      display: "flex",
                      gap: "10px",
                    }}
                  >
                    <button
                      style={{
                        flex: 1,
                        padding: "8px",
                        border:
                          regAccountType === "phone"
                            ? "2px solid #00b140"
                            : "1px solid #ddd",
                        background:
                          regAccountType === "phone" ? "#f0fff4" : "#fff",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                      onClick={() => setRegAccountType("phone")}
                    >
                      📱 手机号
                    </button>
                    <button
                      style={{
                        flex: 1,
                        padding: "8px",
                        border:
                          regAccountType === "email"
                            ? "2px solid #00b140"
                            : "1px solid #ddd",
                        background:
                          regAccountType === "email" ? "#f0fff4" : "#fff",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                      onClick={() => setRegAccountType("email")}
                    >
                      📧 邮箱
                    </button>
                    <button
                      style={{
                        flex: 1,
                        padding: "8px",
                        border:
                          regAccountType === "id"
                            ? "2px solid #00b140"
                            : "1px solid #ddd",
                        background:
                          regAccountType === "id" ? "#f0fff4" : "#fff",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "13px",
                      }}
                      onClick={() => setRegAccountType("id")}
                    >
                      🔖 ID
                    </button>
                  </div>
                  <input
                    type="text"
                    className="input-box"
                    placeholder={
                      regAccountType === "phone"
                        ? "手机号"
                        : regAccountType === "email"
                          ? "邮箱"
                          : "自定义 ID"
                    }
                    style={{ marginBottom: "10px" }}
                    value={regAccount}
                    onInput={(e) =>
                      setRegAccount((e.target as HTMLInputElement).value)
                    }
                  />
                  <input
                    type="text"
                    className="input-box"
                    placeholder="昵称 / Name"
                    style={{ marginBottom: "10px" }}
                    value={regName}
                    onInput={(e) =>
                      setRegName((e.target as HTMLInputElement).value)
                    }
                  />
                  <input
                    type="password"
                    className="input-box"
                    placeholder="密码 / Password (简单即可)"
                    style={{ marginBottom: "10px" }}
                    value={regPassword}
                    onInput={(e) =>
                      setRegPassword((e.target as HTMLInputElement).value)
                    }
                  />
                  {regError && (
                    <div
                      style={{
                        color: "#f56565",
                        fontSize: "12px",
                        marginBottom: "10px",
                      }}
                    >
                      {regError}
                    </div>
                  )}
                  <button
                    className="btn-full-green"
                    onClick={handleRegister}
                    disabled={loading}
                    style={{ background: "#00b140" }}
                  >
                    {loading ? "..." : "注册 / Register"}
                  </button>
                </>
              )}

              <div style={{ marginTop: "15px" }}>
                <a
                  href="javascript:void(0)"
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setLoginError("");
                    setRegError("");
                  }}
                  style={{
                    fontSize: "14px",
                    color: "#666",
                    textDecoration: "none",
                  }}
                >
                  {isRegisterMode ? "已有账号？去登录" : "没有账号？立即注册"}
                </a>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* ===== 已登录状态 ===== */}

            {/* 提示栏 */}
            <div className="user-hint-bar">
              Sve istorijske porudžbine / 显示所有历史订单
            </div>

            <div className="modal-content" style={{ background: "#f7f8fa" }}>
              {/* 用户信息栏 */}
              <div className="user-info-bar">
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  {/* 头像 */}
                  {userInfo?.avatar ? (
                    <img
                      src={userInfo.avatar}
                      alt="avatar"
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        background: "#ddd",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "20px",
                      }}
                    >
                      👋
                    </div>
                  )}

                  <div>
                    <div className="user-phone-num">
                      {userInfo?.name || userInfo?.phone || "用户"}
                    </div>
                    <div className="user-subtitle">
                      {userInfo?.email
                        ? userInfo.email
                        : "欢迎回来 / Dobrodošli"}
                    </div>
                  </div>
                </div>
                <button className="btn-logout-simple" onClick={handleLogout}>
                  退出 / Logout
                </button>
              </div>

              <div className="orders-tip">历史订单 / Istorija narudžbina</div>

              {/* 历史订单列表 */}
              {history.length === 0 ? (
                <div className="no-orders">
                  <p>
                    📋 暂无历史订单
                    <br />
                    Nema istorije narudžbina
                  </p>
                  {/* 如果是 Google 登录但没绑定手机号，提示绑定 */}
                  {!userInfo?.phone && (
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#f56565",
                        marginTop: "5px",
                      }}
                    >
                      * 请联系商家绑定手机号以查看历史订单
                    </p>
                  )}
                </div>
              ) : (
                history.map((order, idx) => (
                  <div key={idx} className="history-order-card">
                    {/* 顶部：订单号 + 总价 */}
                    <div className="order-top">
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span
                          className="order-num"
                          style={{ fontSize: "12px", color: "#999" }}
                        >
                          #{order.order_no || order.id || 231 - idx}
                        </span>
                        <span
                          style={{
                            fontSize: "16px",
                            fontWeight: "bold",
                            color: "#333",
                          }}
                        >
                          取餐号:{" "}
                          <span style={{ color: "#2196f3", fontSize: "18px" }}>
                            {String(order.order_no || order.id).slice(-3)}
                          </span>
                        </span>
                      </div>
                      <span className="order-price">
                        {(order.total || 0).toLocaleString()} RSD
                      </span>
                    </div>

                    {/* 商品内容 - 双语显示 */}
                    <div className="order-content">
                      {order.items?.map((i, iIdx) => (
                        <div key={iIdx}>
                          {i.name}{" "}
                          <span style={{ color: "#666" }}>
                            {i.subName || i.sub_name}
                          </span>{" "}
                          x{i.quantity}
                        </div>
                      )) ||
                        order.itemsText ||
                        "商品信息"}
                    </div>

                    {/* 状态与骑手信息 */}
                    <div style={{ margin: "8px 0" }}>
                      {order.status === "delivering" ? (
                        <div
                          style={{
                            background: "#e3f2fd",
                            padding: "8px",
                            borderRadius: "6px",
                            border: "1px solid #90caf9",
                          }}
                        >
                          <div
                            style={{
                              color: "#1976d2",
                              fontWeight: "bold",
                              marginBottom: "4px",
                            }}
                          >
                            🛵 派送中 / Delivering
                          </div>
                          {(() => {
                            try {
                              const info = order.deliveryInfo
                                ? JSON.parse(order.deliveryInfo)
                                : null;
                              if (info) {
                                return (
                                  <div
                                    style={{ fontSize: "13px", color: "#333" }}
                                  >
                                    <div>骑手: {info.name}</div>
                                    <a
                                      href={`tel:${info.phone}`}
                                      style={{
                                        display: "block",
                                        marginTop: "2px",
                                        color: "#1976d2",
                                        fontWeight: "bold",
                                        textDecoration: "none",
                                      }}
                                    >
                                      📞 {info.phone}
                                    </a>
                                  </div>
                                );
                              }
                            } catch (e) {}
                            return null;
                          })()}
                        </div>
                      ) : (
                        <div
                          style={{
                            display: "inline-block",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            background:
                              order.status === "pending"
                                ? "#fff3e0"
                                : order.status === "confirmed"
                                  ? "#e3f2fd"
                                  : "#f5f5f5",
                            color:
                              order.status === "pending"
                                ? "#ff9800"
                                : order.status === "confirmed"
                                  ? "#2196f3"
                                  : "#666",
                          }}
                        >
                          {order.status === "pending"
                            ? "待处理 / Pending"
                            : order.status === "confirmed"
                              ? "已接单 / Confirmed"
                              : order.status === "completed"
                                ? "已完成 / Completed"
                                : order.status}
                        </div>
                      )}
                    </div>

                    {/* 底部：日期 + 数量控制 */}
                    <div className="order-bottom">
                      <span className="order-time">
                        {order.date || "2025-12-08"}
                      </span>

                      {/* 数量控制 */}
                      {(orderQty[idx] || 0) === 0 ? (
                        <div
                          className="circle-plus"
                          onClick={() => handleAddToCart(order, idx)}
                        >
                          +
                        </div>
                      ) : (
                        <div className="qty-ctrl">
                          <button
                            className="qty-btn"
                            onClick={() => adjustQty(idx, -1)}
                          >
                            −
                          </button>
                          <span className="qty-num">{orderQty[idx]}</span>
                          <button
                            className="qty-btn"
                            onClick={() => adjustQty(idx, 1)}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {/* 加载更多按钮 */}
              {hasMoreHistory && (
                <div style={{ textAlign: "center", margin: "15px 0" }}>
                  <button
                    className="btn-load-more"
                    onClick={loadMoreHistory}
                    disabled={isLoadingMore}
                    style={{
                      background: "#fff",
                      border: "1px solid #ddd",
                      padding: "8px 20px",
                      borderRadius: "20px",
                      fontSize: "13px",
                      color: "#666",
                      cursor: "pointer",
                    }}
                  >
                    {isLoadingMore
                      ? "Učitavanje... / 加载中..."
                      : "Prikaži više / 加载更多订单"}
                  </button>
                </div>
              )}

              {/* 退出登录链接 */}
              <div className="logout-link" onClick={handleLogout}>
                Odjavi se / 退出登录
              </div>
            </div>

            {/* 底部结算栏 */}
            {$total.count > 0 && (
              <div className="orders-footer-bar">
                <div className="footer-left">
                  <span className="footer-badge">{$total.count}</span>
                  <span className="footer-total">
                    {$total.price.toLocaleString()} <small>RSD</small>
                  </span>
                </div>
                <button className="btn-goto-cart" onClick={goToCart}>
                  Idi u korpu / 去结算 →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
