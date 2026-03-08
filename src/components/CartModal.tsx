import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import {
  cartItems,
  cartTotal,
  addToCart,
  removeOne,
  clearCart,
} from "../store/cartStore";
import { getUserInfo, saveUserInfo } from "../lib/userStore";
import {
  CART_SUPPRESS_RELOAD_MS,
  DEFAULT_USER_PASSWORD,
} from "../lib/clientConfig";
import GoogleLoginButton from "./GoogleLoginButton";
import BottomNavBar from "./cart-modal/BottomNavBar";
import WechatPayModal from "./cart-modal/WechatPayModal";
import { REMARK_CATEGORIES } from "./cart-modal/remarkCategories";
import { useRemarkState } from "./cart-modal/useRemarkState";
import { useAuthState } from "./cart-modal/useAuthState";

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

interface AddressPayload {
  name?: string;
  phone?: string;
  address?: string;
}

interface AddressApiResponse {
  success?: boolean;
  address?: string;
}

declare global {
  interface Window {
    __suppressMqttReloadUntil?: number;
  }
}

export default function CartModal({
  restaurantId,
  shopSettings,
  isDeliveryLocked = false,
  deliveryLockReason = "余额不足，请先充值后使用外卖 / Insufficient wallet balance, please top up first",
  isTableLocked = false,
  enableDelivery = true,
  enableDineIn = true,
  enableReservation = false,
  isAdmin = false,
  tableConfig = [],
}: CartModalProps) {
  const $total = useStore(cartTotal);
  const $items = useStore(cartItems);

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(1); // 1=购物车, 2=外卖表单
  const [loading, setLoading] = useState(false);
  const [showWechat, setShowWechat] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [tableNumber, setTableNumber] = useState("");
  const [orderText, setOrderText] = useState("");

  const [reservationTime, setReservationTime] = useState("");
  const [deliveryTimeMode, setDeliveryTimeMode] = useState<
    "asap" | "scheduled"
  >("asap");

  const [form, setForm] = useState<OrderForm>({
    name: "",
    phone: "",
    password: DEFAULT_USER_PASSWORD,
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
  const exchangeRate = parseFloat(String(settings.currency?.rate || 0.07));
  const wechatQr = settings.currency?.wechat_qr || "";

  const openTime = settings.hours?.open || "10:00";
  const closeTime = settings.hours?.close || "23:00";

  const checkShopOpen = () => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const [openH, openM] = openTime.split(":").map(Number);
    const [closeH, closeM] = closeTime.split(":").map(Number);
    const openMinutes = openH * 60 + openM;
    let closeMinutes = closeH * 60 + closeM;
    if (closeMinutes <= openMinutes) {
      closeMinutes += 24 * 60;
    }
    if (currentMinutes >= openMinutes && currentMinutes < closeMinutes) {
      return true;
    }
    if (closeMinutes > 24 * 60 && currentMinutes < closeMinutes - 24 * 60) {
      return true;
    }
    return false;
  };

  const isShopOpen = checkShopOpen();
  const currentShipping = $total.price >= freeThreshold ? 0 : deliveryFee;
  const isFreeShipping = $total.price >= freeThreshold;
  const finalTotalDelivery = $total.price + currentShipping;
  const finalTotalDine = $total.price;
  const cnyTotal = (finalTotalDelivery * exchangeRate * 1.05).toFixed(2);

  useEffect(() => {
    const user = getUserInfo();
    setForm((prev) => ({
      ...prev,
      name: user.name || "",
      phone: user.phone || "",
      password: user.password || DEFAULT_USER_PASSWORD,
      address: user.address || "",
    }));
    setHistoryAddrs(user.addresses || []);

    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get("table");
    const modeParam = urlParams.get("mode");
    const deliveryDefault = !tableParam && modeParam !== "tables";
    setDeliveryMode(modeParam === "delivery" || deliveryDefault);
    if (tableParam) {
      setTableNumber(tableParam);
    }

    const handleOpenCart = () => {
      setIsOpen(true);
      setStep(1);
    };
    window.addEventListener("open-cart", handleOpenCart);
    return () => window.removeEventListener("open-cart", handleOpenCart);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const fetchAddress = async () => {
        const sessionToken = localStorage.getItem("user_session");
        if (!sessionToken) return;
        try {
          const res = await fetch("/api/user/address", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "get", sessionToken }),
          });
          const data: AddressApiResponse = await res.json();
          if (data.success && data.address) {
            let addrObj: AddressPayload = {};
            try {
              addrObj = JSON.parse(data.address) as AddressPayload;
            } catch {
              addrObj = { address: data.address };
            }
            setForm((prev) => ({
              ...prev,
              name: addrObj.name || prev.name,
              phone: addrObj.phone || prev.phone,
              address: addrObj.address || prev.address,
            }));
          }
        } catch (error) {}
      };
      fetchAddress();
    }
  }, [isOpen]);

  const generateOrderText = () => {
    const items = Object.values($items)
      .map((i) => `${i.name}${i.subName ? " " + i.subName : ""} x${i.quantity}`)
      .join(", ");
    return `订单: ${items}\n地址: ${form.address}\n总计: ${finalTotalDelivery} RSD (¥${cnyTotal})`;
  };

  const submitOrder = async (
    type: "dine_in" | "delivery",
    paymentMethod: "cash" | "wechat",
    tableNum = "",
    needsReview = false,
    remarks: string[] = [],
  ) => {
    const redirectToTableSelector = () => {
      const targetPath = `/${restaurantId}/tables`;
      window.location.assign(targetPath);
    };

    const dineInAction =
      type === "dine_in"
        ? String(new URLSearchParams(window.location.search).get("op") || "").toLowerCase()
        : "";

    if (type === "dine_in") {
      try {
        window.__suppressMqttReloadUntil = Date.now() + CART_SUPPRESS_RELOAD_MS;
      } catch {}
    }

    setLoading(true);
    let fullInfo = "";
    let finalPrice = 0;

    if (type === "dine_in") {
      fullInfo = tableNum;
      finalPrice = finalTotalDine;
    } else {
      if (!form.name || !form.phone || !form.address) {
        setLoading(false);
        return alert("请填写完整信息 / Popunite sve podatke");
      }
      if (form.phone.length < 6) {
        setLoading(false);
        return alert("电话号码太短 / Phone number too short");
      }
      const payStr = paymentMethod === "wechat" ? "[微信支付/WeChat]" : "[货到付款/Cash]";
      const timeStr = reservationTime ? ` [预定: ${reservationTime.replace("T", " ")}]` : "";
      const allRemarks = [...deliveryRemarks];
      if (customRemark.trim()) allRemarks.push(customRemark.trim());
      const finalNote = allRemarks.length > 0 ? allRemarks.join(", ") : form.note;
      fullInfo = `${form.name}, ${form.phone}, ${form.address} ${payStr}${timeStr} (备注:${finalNote})`;
      finalPrice = finalTotalDelivery;
    }

    const userInfo = type === "delivery" || (form.phone && form.phone.length > 0)
        ? { name: form.name, phone: form.phone, password: form.password, address: form.address }
        : undefined;

    let finalRemarks: string[] = [];
    if (type === "delivery") {
      finalRemarks = [...deliveryRemarks, ...(customRemark.trim() ? [customRemark.trim()] : [])];
    } else {
      finalRemarks = [...remarks, ...(dineInCustomRemark.trim() ? [dineInCustomRemark.trim()] : [])];
    }
    const finalNote = finalRemarks.length > 0 ? finalRemarks.join(", ") : form.note;

    const orderData = {
      restaurantId, items: $items, total: finalPrice, type, info: fullInfo, note: finalNote, remarks: finalRemarks,
      scheduled_for: type === "delivery" && deliveryTimeMode === "scheduled" ? reservationTime : "",
      user: userInfo, status: needsReview && dineInAction !== "add" ? "review_needed" : "pending",
      dineInAction, isAdmin,
    };

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        if (resData.orderId) localStorage.setItem("last_order_id", resData.orderId);
        if (type === "dine_in") {
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: "ORDER_SUBMITTED", tableId: tableNum }, "*");
            }
          } catch {}
          clearCart();
          resetAllRemarks();
          if (!isAdmin) redirectToTableSelector();
          return;
        }
        if (type === "delivery") saveUserInfo(form.name, form.phone, form.password, form.address);
        clearCart();
        resetAllRemarks();
        if (type === "delivery") {
          window.location.href = resData.orderNo ? `/${restaurantId}/order-view/${encodeURIComponent(resData.orderNo)}` : "/" + restaurantId;
        }
      } else {
        alert(`❌ 下单失败: ${resData.error || "Unknown Error"}`);
      }
    } catch (error) {
      alert("Network Error");
    }
    setLoading(false);
  };

  const [remarkState, remarkDispatch] = useRemarkState();
  const dineInRemarks = remarkState.dineInRemarks;
  const showRemarksPanel = remarkState.showDineInPanel;
  const dineInCustomRemark = remarkState.dineInCustomRemark;
  const deliveryRemarks = remarkState.deliveryRemarks;
  const showDeliveryRemarksPanel = remarkState.showDeliveryPanel;
  const customRemark = remarkState.deliveryCustomRemark;
  const remarkCategories = REMARK_CATEGORIES;

  const resetAllRemarks = () => remarkDispatch({ type: "reset" });
  const toggleRemark = (remark: string) => remarkDispatch({ type: "toggle_dine_remark", payload: remark });
  const toggleDeliveryRemark = (remark: string) => remarkDispatch({ type: "toggle_delivery_remark", payload: remark });

  const handleConfirmDineIn = () => {
    if (!tableNumber.trim()) return alert("请输入桌号");
    setShowTableModal(false);
    submitOrder("dine_in", "cash", tableNumber, isTableLocked, dineInRemarks);
  };

  const handleCloseWechat = () => {
    setShowWechat(false); clearCart(); resetAllRemarks(); setIsOpen(false);
    window.location.reload();
  };

  useEffect(() => {
    const checkStatus = async () => {
      const lastId = localStorage.getItem("last_order_id");
      if (!lastId) return;
      try {
        const res = await fetch(`/api/order/status?id=${lastId}`);
        const data = await res.json();
        if (data.success && data.status === "cancelled") {
          alert("⚠️ 您的订单已被拒绝");
          localStorage.removeItem("last_order_id");
          window.location.reload();
        }
      } catch (e) {}
    };
    checkStatus();
  }, []);

  const itemsArray = Object.values($items);

  return (
    <>
      {!isOpen && !showWechat && (
        <BottomNavBar tableNumber={tableNumber} totalPrice={$total.price} totalCount={$total.count} onOpenCart={() => setIsOpen(true)} />
      )}

      {showTableModal && (
        <div className="modal-overlay center" onClick={(e) => e.target === e.currentTarget && setShowTableModal(false)}>
          <div className="table-modal" style={{ maxWidth: "800px", width: "95%", padding: "30px", maxHeight: "85vh", overflowY: "auto" }}>
            <div className="close-top"><button onClick={() => setShowTableModal(false)}>&times;</button></div>
            <h4 style={{ fontSize: "22px", marginBottom: "20px" }}>堂食下单</h4>
            <div style={{ textAlign: "center" }}>
              <input type="text" value={tableNumber} onInput={(e) => setTableNumber((e.target as HTMLInputElement).value)} placeholder="桌号" style={{ fontSize: "36px", textAlign: "center", width: "120px", padding: "10px", border: "2px solid #4caf50", borderRadius: "12px" }} />
            </div>
            <button className="btn-confirm-table" onClick={handleConfirmDineIn} disabled={loading} style={{ marginTop: "20px", height: "50px", width: "100%", background: "#4caf50", color: "#fff", border: "none", borderRadius: "8px", fontSize: "18px" }}>确认下单</button>
          </div>
        </div>
      )}

      {isOpen && (
        <div className="modal-overlay" onClick={(e) => (e.target as HTMLElement).classList.contains("modal-overlay") && setIsOpen(false)}>
          <div className="cart-modal">
            <div className="modal-header">
              <h2>{step === 1 ? "购物车" : "外卖"} ({$total.count})</h2>
              <button className="modal-close" onClick={() => setIsOpen(false)}>&times;</button>
            </div>
            <div className="modal-content">
              {itemsArray.map((item) => (
                <div key={item.id} className="cart-item-card">
                  <div className="cart-item-details">
                    <div style={{fontWeight:'bold'}}>{item.name}</div>
                    <div style={{fontSize:'12px', color:'#666'}}>{item.subName}</div>
                    <div>{item.price} RSD</div>
                  </div>
                  <div className="cart-qty-bar">
                    <button onClick={() => removeOne(item.id)}>&minus;</button>
                    <span>{item.quantity}</span>
                    <button onClick={() => addToCart(item)}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="cart-summary">
              <div className="cart-total-row">总计: {$total.price} RSD</div>
              <div className="cart-action-btns">
                <button className="cart-btn-dine" onClick={() => { if(tableNumber) submitOrder("dine_in", "cash", tableNumber); else { setIsOpen(false); setShowTableModal(true); } }}>堂食下单</button>
                <button className="cart-btn-delivery" onClick={() => setStep(2)}>外卖下单</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: flex-end; z-index: 1000; }
        .modal-overlay.center { align-items: center; justify-content: center; }
        .cart-modal, .table-modal { background: #fff; width: 100%; border-radius: 20px 20px 0 0; padding: 20px; max-height: 80vh; overflow-y: auto; }
        .table-modal { border-radius: 20px; width: 90%; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .cart-item-card { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #eee; }
        .cart-qty-bar { display: flex; align-items: center; gap: 12px; }
        .cart-qty-bar button { width: 28px; height: 28px; border-radius: 50%; border: 1px solid #ddd; background: #fff; cursor: pointer; }
        .cart-summary { margin-top: 20px; border-top: 2px solid #eee; padding-top: 20px; }
        .cart-total-row { font-size: 20px; font-weight: bold; margin-bottom: 20px; text-align: right; }
        .cart-action-btns { display: flex; gap: 10px; }
        .cart-action-btns button { flex: 1; padding: 15px; border-radius: 12px; border: none; font-weight: bold; color: #fff; cursor: pointer; }
        .cart-btn-dine { background: #2196f3; }
        .cart-btn-delivery { background: #ff9800; }
        .close-top { text-align: right; margin-top: -10px; margin-right: -10px; }
        .close-top button { background: none; border: none; font-size: 28px; cursor: pointer; color: #999; }
      `}</style>
    </>
  );
}
