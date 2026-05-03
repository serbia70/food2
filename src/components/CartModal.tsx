import { useMemo, useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import {
  cartItems,
  addToCart,
  removeOne,
  removeFromCart,
  clearCart,
  getCartTotals,
  getSpecialPriceDisplay,
  getSpendDiscountStatus,
  type SpecialPromotion,
  type SpendDiscountPromotion,
} from "../store/cartStore";
import { getUserInfo, saveUserInfo } from "../lib/userStore";
import { CART_SUPPRESS_RELOAD_MS } from "../lib/clientConfig";
import { SHOP_EVENTS } from "../lib/events";
import {
  buildTableButtonLabel,
  buildTableValue,
  isSimpleHallMode,
} from "../lib/table-config";
import BottomNavBar from "./cart-modal/BottomNavBar";
import CartAuthPanel from "./cart-modal/CartAuthPanel";
import CartDeliveryForm from "./cart-modal/CartDeliveryForm";
import CartDineInRemarksPanel from "./cart-modal/CartDineInRemarksPanel";
import CartModeActions from "./cart-modal/CartModeActions";
import CartTableModal from "./cart-modal/CartTableModal";
import WechatPayModal from "./cart-modal/WechatPayModal";
import { useDineInTableFlow } from "./cart-modal/useDineInTableFlow";
import { useCartOrderSubmit } from "./cart-modal/useCartOrderSubmit";
import { REMARK_CATEGORIES } from "./cart-modal/remarkCategories";
import { useRemarkState } from "./cart-modal/useRemarkState";
import { useAuthState } from "./cart-modal/useAuthState";
import { useCartProfileSync } from "./cart-modal/useCartProfileSync";
import type { ShopDisplaySettings } from "../lib/shop-display-settings";
import { isCustomerActiveStatus } from "../lib/rider-dispatch";

interface ShopSettings {
  delivery?: {
    fee?: number | string;
    free_threshold?: number | string;
    zones?: string;
  };
  currency?: {
    rate?: number | string;
    wechat_qr?: string;
  };
  hours?: {
    open?: string;
    close?: string;
  };
}

interface CartModalProps {
  restaurantId?: string | number;
  shopSettings?: ShopSettings;
  resolvedDisplaySettings?: ShopDisplaySettings;
  specialPromotionMap?: Record<string, SpecialPromotion>;
  spendDiscountPromotion?: SpendDiscountPromotion | null;
  isDeliveryLocked?: boolean;
  deliveryLockReason?: string;
  isTableLocked?: boolean;
  enableDelivery?: boolean;
  enableDineIn?: boolean;
  enableReservation?: boolean;
  isAdmin?: boolean;
  tableConfig?: { name: string; count: number; prefix?: string }[];
}

interface OrderForm {
  name: string;
  phone: string;
  password: string;
  address: string;
  note: string;
}

declare global {
  interface Window {
    __suppressMqttReloadUntil?: number;
  }
}

/**
 * CartModal - 完美还原7张截图
 * 图2: 底部白色导航栏 (蓝色购物车球)
 * 图4: 购物车弹窗 (蓝色堂食/橙色外卖按钮)
 * 图5: 堂食桌号弹窗 (绿色边框输入框)
 * 图1/6: 外卖表单 (价格汇总/免运费/付款按钮)
 * 图7: 微信支付弹窗 (绿色圆圈/复制按钮)
 */
export default function CartModal({
  restaurantId,
  shopSettings,
  resolvedDisplaySettings,
  specialPromotionMap = {},
  spendDiscountPromotion = null,
  isDeliveryLocked = false,
  deliveryLockReason = "余额不足，请先充值后使用外卖 / Insufficient wallet balance, please top up first",
  isTableLocked = false,
  enableDelivery = true,
  enableDineIn = true,
  enableReservation = false,
  isAdmin = false,
  tableConfig = [],
}: CartModalProps) {
  const $items = useStore(cartItems);
  const $total = useMemo(() => getCartTotals($items, specialPromotionMap), [$items, specialPromotionMap]);

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1); // 1=购物车, 2=外卖表单
  const [loading, setLoading] = useState(false);
  const [showWechat, setShowWechat] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableNumber, setTableNumber] = useState("");
  const [orderText, setOrderText] = useState("");

  // 预定时间状态
  const [reservationTime, setReservationTime] = useState("");
  const [deliveryTimeMode, setDeliveryTimeMode] = useState<
    "asap" | "scheduled"
  >("asap");

  const [form, setForm] = useState<OrderForm>({
    name: "",
    phone: "",
    password: "",
    address: "",
    note: "",
  });
  const [historyAddrs, setHistoryAddrs] = useState<string[]>([]);
  const [deliveryMode, setDeliveryMode] = useState(false);

  const auth = useAuthState({
    onProfileUpdate: ({ name, phone, address, addresses }) => {
      setForm((prev) => ({
        ...prev,
        name: name || prev.name,
        phone: phone || prev.phone,
        address: address || prev.address,
      }));
      if (addresses) {
        setHistoryAddrs(addresses);
      }
    },
    onGoogleSuccess: () => window.location.reload(),
  });

  const settings = shopSettings || {};
  const deliveryFee = parseInt(String(settings.delivery?.fee || 0));
  const freeThreshold = parseInt(
    String(settings.delivery?.free_threshold || 99999),
  );
  const zones = (settings.delivery?.zones || "")
    .split(",")
    .map((z) => z.trim())
    .filter((z) => z);
  const exchangeRate = parseFloat(String(settings.currency?.rate || 0.07));
  const wechatQr = settings.currency?.wechat_qr || "";

  const simpleHallMode = isSimpleHallMode(tableConfig);

  // 营业时间检查
  const openTime = resolvedDisplaySettings?.hours?.open?.trim() || settings.hours?.open?.trim() || "";
  const closeTime = resolvedDisplaySettings?.hours?.close?.trim() || settings.hours?.close?.trim() || "";
  const hoursDisplayText = openTime && closeTime ? `${openTime} - ${closeTime}` : "未设置";

  const checkShopOpen = () => {
    if (!openTime || !closeTime) {
      return false;
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [openH, openM] = openTime.split(":").map(Number);
    const [closeH, closeM] = closeTime.split(":").map(Number);
    if (
      Number.isNaN(openH) ||
      Number.isNaN(openM) ||
      Number.isNaN(closeH) ||
      Number.isNaN(closeM)
    ) {
      return false;
    }

    const openMinutes = openH * 60 + openM;
    let closeMinutes = closeH * 60 + closeM;

    // 如果关店时间是00:00或更小，视为第二天凌晨
    if (closeMinutes <= openMinutes) {
      closeMinutes += 24 * 60;
    }

    // 如果当前时间在开店前，直接比较
    if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
      return true;
    }
    // 跨夜营业处理
    if (closeMinutes > 24 * 60 && currentMinutes < closeMinutes - 24 * 60) {
      return true;
    }
    return false;
  };

  const isShopOpen = checkShopOpen();
  const spendDiscountStatus = getSpendDiscountStatus($total.price, spendDiscountPromotion);

  const currentShipping = $total.price >= freeThreshold ? 0 : deliveryFee;

  const isFreeShipping = $total.price >= freeThreshold;
  const finalTotalDelivery = $total.price + currentShipping;
  const finalTotalDine = $total.price;
  const cnyTotal = (finalTotalDelivery * exchangeRate * 1.05).toFixed(2);

  useCartProfileSync({
    isOpen,
    setIsOpen,
    setStep,
    setDeliveryMode,
    setTableNumber,
    setForm,
    setHistoryAddrs,
  });

  // 生成订单文本
  const generateOrderText = () => {
    const items = Object.values($items)
      .map((i) => `${i.name}${i.subName ? " " + i.subName : ""} x${i.quantity}`)
      .join(", ");
    return `订单: ${items}\n地址: ${form.address}\n总计: ${finalTotalDelivery} RSD (¥${cnyTotal})`;
  };

  const [remarkState, remarkDispatch] = useRemarkState();
  const dineInRemarks = remarkState.dineInRemarks;
  const showRemarksPanel = remarkState.showDineInPanel;
  const dineInCustomRemark = remarkState.dineInCustomRemark;
  const deliveryRemarks = remarkState.deliveryRemarks;
  const showDeliveryRemarksPanel = remarkState.showDeliveryPanel;
  const customRemark = remarkState.deliveryCustomRemark;
  const remarkCategories = REMARK_CATEGORIES;

  const resetAllRemarks = () => {
    remarkDispatch({ type: "reset" });
  };

  const toggleRemark = (remark: string) => {
    remarkDispatch({ type: "toggle_dine_remark", payload: remark });
  };

  const toggleDeliveryRemark = (remark: string) => {
    remarkDispatch({ type: "toggle_delivery_remark", payload: remark });
  };

  const { submitOrder } = useCartOrderSubmit({
    restaurantId,
    isAdmin,
    form,
    items: $items,
    promotionMap: specialPromotionMap,
    finalTotalDelivery,
    finalTotalDine,
    deliveryTimeMode,
    reservationTime,
    deliveryRemarks,
    customRemark,
    dineInCustomRemark,
    resetAllRemarks,
    setLoading,
    setDeliveryTimeMode,
    setReservationTime,
  });

  const {
    handleConfirmDineIn,
    handleSwitchTable,
    openTableModal,
    closeTableModal,
  } = useDineInTableFlow({
    tableNumber,
    isTableLocked,
    dineInRemarks,
    submitOrder,
    setShowTableModal,
    resetAllRemarks,
  });

  // 复制订单 - 图7
  const handleCopyOrder = () => {
    navigator.clipboard
      ?.writeText(orderText)
      .then(() => {
        alert("✅ 订单已复制！请发送给商家\nKopirano! Pošaljite prodavcu");
      })
      .catch(() => {
        alert(orderText);
      });
  };

  // 关闭微信弹窗
  const handleCloseWechat = () => {
    setShowWechat(false);
    clearCart();
    resetAllRemarks();
    setIsOpen(false);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("embed") === "1") {
      window.parent.postMessage({ type: "ORDER_SUBMITTED" }, "*");
    } else if (urlParams.get("isAdmin") === "true") {
      // 管理员模式返回桌号选择页面
      window.location.href = "/" + restaurantId;
    } else {
      window.location.reload();
    }
  };

  // 非轮询：在进入页面和回到页面时检查订单状态
  useEffect(() => {
    const checkStatus = async () => {
      const lastId = localStorage.getItem("last_order_id");
      if (!lastId) return;

      try {
        const res = await fetch(`/api/order/status?id=${lastId}`);
        const data = await res.json();
        if (data.success) {
          if (data.status === "cancelled") {
            let reason = "商家未说明原因";
            if (Array.isArray(data.remarks)) {
              const r = data.remarks.find((x: string) =>
                x.includes("拒绝原因"),
              );
              if (r) reason = r.replace("❌ 拒绝原因: ", "");
            }
            alert(
              `⚠️ 您的订单已被拒绝 / Your order was rejected\n\n原因: ${reason}`,
            );
            localStorage.removeItem("last_order_id");
            window.location.reload();
          } else if (!isCustomerActiveStatus(data.status)) {
            localStorage.removeItem("last_order_id");
          }
        }
      } catch (e) {
        console.error("Order status check error", e);
      }
    };

    const handleFocus = () => {
      checkStatus();
    };
    const handleVisibility = () => {
      if (!document.hidden) checkStatus();
    };

    checkStatus();
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const itemsArray = Object.values($items);

  return (
    <>
      {/* ========== 底部导航栏 - 三个元素靠右 ========== */}
      {!isOpen && !showWechat && (
        <BottomNavBar
          tableNumber={tableNumber}
          totalPrice={$total.price}
          totalCount={$total.count}
          enableReservation={enableReservation}
          onOpenCart={() => setIsOpen(true)}
        />
      )}

      {/* ========== 微信支付弹窗 - 图7样式 ========== */}
      {showWechat && (
        <WechatPayModal
          cnyTotal={cnyTotal}
          wechatQr={wechatQr}
          onCopyOrder={handleCopyOrder}
          onClose={handleCloseWechat}
        />
      )}

      {/* ========== 堂食桌号弹窗 (含备注) - 宽版优化 ========== */}
      <CartTableModal
        show={showTableModal}
        tableConfig={tableConfig}
        tableNumber={tableNumber}
        setTableNumber={setTableNumber}
        simpleHallMode={simpleHallMode}
        buildTableValue={buildTableValue}
        buildTableButtonLabel={buildTableButtonLabel}
        remarkCategories={remarkCategories}
        showRemarksPanel={showRemarksPanel}
        dineInRemarks={dineInRemarks}
        dineInCustomRemark={dineInCustomRemark}
        onTogglePanel={() => remarkDispatch({ type: "toggle_dine_panel" })}
        onToggleRemark={toggleRemark}
        onCustomRemarkChange={(value) =>
          remarkDispatch({
            type: "set_dine_custom",
            payload: value,
          })
        }
        onClose={closeTableModal}
        onConfirm={handleConfirmDineIn}
      />

      {/* ========== 购物车主弹窗 ========== */}
      {isOpen && !showWechat && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if ((e.target as HTMLElement).className.includes("modal-overlay"))
              setIsOpen(false);
          }}
        >
          <div className="cart-modal">
            <div className="modal-header">
              <h2>
                {step === 1 ? "Korpa / 购物车" : "Dostava / 外卖"}
                {step === 1 && $total.count > 0 && (
                  <span className="modal-count-badge">{$total.count}</span>
                )}
              </h2>
              {/* 桌号显示和切换按钮 */}
              {tableNumber && !deliveryMode && (
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  <span
                    style={{
                      fontSize: "14px",
                      color: "#666",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    🪑 {tableNumber}
                  </span>
                  <button
                    onClick={handleSwitchTable}
                    style={{
                      background: "#ff5252",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      padding: "4px 10px",
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                    }}
                    title="切换桌号 / Promeni sto"
                  >
                    切换 ✕
                  </button>
                </div>
              )}
              <button className="modal-close" onClick={() => setIsOpen(false)}>
                ×
              </button>
            </div>

            {/* ===== Step 1: 购物车清单 - 图4 ===== */}
            {step === 1 && (
              <>
                <div className="cart-scroll-body">
                  <div className="modal-content">
                    <div className="cart-list">
                      {itemsArray.map((item) => {
                        const { displayPrice, originalPrice, isSpecialPrice } = getSpecialPriceDisplay(item, specialPromotionMap);

                        return (
                        <div key={item.id} className="cart-item-card">
                          <img
                            src={item.img || item.image}
                            alt={item.name}
                            className="cart-item-img"
                          />

                          <div className="cart-item-details">
                            <div className="cart-item-name">{item.name}</div>
                            <div className="cart-item-desc">{item.subName}</div>
                            <div className="cart-item-price" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              {isSpecialPrice && (
                                <span style={{ fontSize: "10px", fontWeight: "700", color: "#c53030", background: "#fed7d7", borderRadius: "999px", padding: "1px 6px", width: "fit-content" }}>
                                  今日特价
                                </span>
                              )}
                              <span>{displayPrice} RSD</span>
                              {isSpecialPrice && (
                                <span style={{ color: "#a0aec0", fontSize: "12px", textDecoration: "line-through" }}>
                                  {originalPrice} RSD
                                </span>
                              )}
                            </div>

                            <div className="cart-qty-bar">
                              <button
                                className="qty-minus"
                                onClick={() => removeOne(item.id)}
                              >
                                −
                              </button>
                              <span className="qty-value">{item.quantity}</span>
                              <button
                                className="qty-plus"
                                onClick={() => addToCart(item)}
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <button
                            className="cart-item-remove"
                            onClick={() => removeFromCart(item.id)}
                          >
                            ×
                          </button>
                        </div>
                        );
                      })}

                      {$total.count === 0 && (
                        <div className="cart-empty">
                          <p>🛒 Korpa je prazna / 购物车是空的</p>
                        </div>
                      )}
                    </div>

                    {/* 底部 - 图4样式 (蓝色堂食/橙色外卖) */}
                    <div className="cart-summary">
                      <div className="cart-total-row">
                        <span>Ukupno / 总计:</span>
                        <span className="cart-total-val">
                          {$total.price.toLocaleString()} <small>RSD</small>
                        </span>
                      </div>

                      {spendDiscountStatus && (
                        <div style={{ marginTop: "8px", padding: "10px 12px", borderRadius: "10px", background: "#fffaf0", color: "#9c4221" }}>
                          {spendDiscountStatus.qualified
                            ? `已享满 ${spendDiscountStatus.minSpend} 减 ${spendDiscountStatus.discountAmount}`
                            : `再买 ${spendDiscountStatus.remaining} RSD，即可满 ${spendDiscountStatus.minSpend} 减 ${spendDiscountStatus.discountAmount}`}
                        </div>
                      )}

                      {/* 打烊提示 */}
                      {!isShopOpen && (
                        <div className="shop-closed-banner">
                          🚫 Zatvoreno / 店铺已打烊
                          <br />
                          <span>
                            Radno vreme / 营业时间: {hoursDisplayText}
                          </span>
                        </div>
                      )}

                      {/* 堂食备注选择（已有桌号时显示） */}
                      {enableDineIn && !deliveryMode && tableNumber && (
                        <CartDineInRemarksPanel
                          showRemarksPanel={showRemarksPanel}
                          dineInRemarks={dineInRemarks}
                          dineInCustomRemark={dineInCustomRemark}
                          remarkCategories={remarkCategories}
                          onTogglePanel={() => remarkDispatch({ type: "toggle_dine_panel" })}
                          onToggleRemark={toggleRemark}
                          onCustomRemarkChange={(value) =>
                            remarkDispatch({
                              type: "set_dine_custom",
                              payload: value,
                            })
                          }
                        />
                      )}

                      <CartModeActions
                        enableDineIn={enableDineIn}
                        enableDelivery={enableDelivery}
                        deliveryMode={deliveryMode}
                        tableNumber={tableNumber}
                        isTableLocked={isTableLocked}
                        dineInRemarks={dineInRemarks}
                        totalCount={$total.count}
                        isShopOpen={isShopOpen}
                        isDeliveryLocked={isDeliveryLocked}
                        deliveryLockReason={deliveryLockReason}
                        onSubmitOrder={submitOrder}
                        onOpenTableModal={() => {
                          setIsOpen(false);
                          setTimeout(() => openTableModal(), 100);
                        }}
                        onStartDelivery={() => {
                          setDeliveryTimeMode("asap");
                          setReservationTime("");
                          setStep(2);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ===== Step 2: 外卖表单 - 图1/图6 ===== */}
            {step === 2 && (
              <div className="modal-content">
                {/* 登录/注册框 */}
                {!getUserInfo().phone &&
                  !getUserInfo().email &&
                  !getUserInfo().login_account && <CartAuthPanel auth={auth} />}
                {/* 价格汇总 - 图6 */}
                <div className="delivery-info-box">
                  <div className="info-row">
                    <span>Hrana / 菜品:</span>
                    <span>{$total.price.toLocaleString()} RSD</span>
                  </div>
                  <div className="info-row">
                    <span>Dostava / 运费:</span>
                    <span className={isFreeShipping ? "free-tag" : ""}>
                      {isFreeShipping
                        ? "Besplatno / 免运费"
                        : `${currentShipping} RSD`}
                    </span>
                  </div>
                  <div className="info-row info-total">
                    <span>Ukupno / 应付:</span>
                    <span className="total-price">
                      {finalTotalDelivery.toLocaleString()} RSD
                    </span>
                  </div>
                  {isFreeShipping && (
                    <div className="free-shipping-banner">
                      Besplatna dostava aktivirana! (已享受免运费)
                    </div>
                  )}
                </div>

                <CartDeliveryForm
                  form={form}
                  setForm={setForm}
                  historyAddrs={historyAddrs}
                  zones={zones}
                  enableDelivery={enableDelivery}
                  deliveryTimeMode={deliveryTimeMode}
                  setDeliveryTimeMode={setDeliveryTimeMode}
                  reservationTime={reservationTime}
                  setReservationTime={setReservationTime}
                  showDeliveryRemarksPanel={showDeliveryRemarksPanel}
                  deliveryRemarks={deliveryRemarks}
                  customRemark={customRemark}
                  remarkCategories={remarkCategories}
                  loading={loading}
                  onToggleDeliveryPanel={() => remarkDispatch({ type: "toggle_delivery_panel" })}
                  onToggleDeliveryRemark={toggleDeliveryRemark}
                  onSetDeliveryCustomRemark={(value) =>
                    remarkDispatch({
                      type: "set_delivery_custom",
                      payload: value,
                    })
                  }
                  onSubmitOrder={submitOrder}
                  onBack={() => setStep(1)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
