import { CART_SUPPRESS_RELOAD_MS } from "../../lib/clientConfig";
import { saveUserInfo } from "../../lib/userStore";
import { clearCart } from "../../store/cartStore";

type SubmitType = "dine_in" | "delivery";
type PaymentMethod = "cash" | "wechat";

type OrderForm = {
  name: string;
  phone: string;
  password: string;
  address: string;
  note: string;
};

type UseCartOrderSubmitOptions = {
  restaurantId?: string | number;
  isAdmin: boolean;
  form: OrderForm;
  items: unknown;
  finalTotalDelivery: number;
  finalTotalDine: number;
  deliveryTimeMode: "asap" | "scheduled";
  reservationTime: string;
  deliveryRemarks: string[];
  customRemark: string;
  dineInCustomRemark: string;
  resetAllRemarks: () => void;
  setLoading: (value: boolean) => void;
  setDeliveryTimeMode: (value: "asap" | "scheduled") => void;
  setReservationTime: (value: string) => void;
};

export function useCartOrderSubmit({
  restaurantId,
  isAdmin,
  form,
  items,
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
}: UseCartOrderSubmitOptions) {
  const redirectToTableSelector = () => {
    const targetPath = `/${restaurantId}/tables`;
    const targetAbs = `${window.location.origin}${targetPath}`;
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = targetAbs;
      }
    } catch {}

    window.location.assign(targetPath);
    setTimeout(() => {
      if (window.location.search.includes("table=")) {
        window.location.href = targetPath;
      }
    }, 240);
  };

  const submitOrder = async (
    type: SubmitType,
    paymentMethod: PaymentMethod,
    tableNum = "",
    needsReview = false,
    remarks: string[] = [],
  ) => {
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
      if (deliveryTimeMode === "scheduled" && !reservationTime) {
        setLoading(false);
        return alert("请选择预约送达时间 / Izaberite vreme zakazane dostave");
      }
      const payStr = paymentMethod === "wechat" ? "[微信支付/WeChat]" : "[货到付款/Cash]";
      const allRemarks = [...deliveryRemarks];
      if (customRemark.trim()) {
        allRemarks.push(customRemark.trim());
      }
      const finalDeliveryNote = allRemarks.length > 0 ? allRemarks.join(", ") : form.note;

      fullInfo = `${form.name}, ${form.phone}, ${form.address} ${payStr} (备注:${finalDeliveryNote})`;
      finalPrice = finalTotalDelivery;
    }

    const userInfo =
      type === "delivery" || (form.phone && form.phone.length > 0)
        ? {
            name: form.name,
            phone: form.phone,
            password: form.password,
            address: form.address,
          }
        : undefined;

    let finalRemarks: string[] = [];
    if (type === "delivery") {
      finalRemarks = [...deliveryRemarks, ...(customRemark.trim() ? [customRemark.trim()] : [])];
    } else {
      finalRemarks = [...remarks, ...(dineInCustomRemark.trim() ? [dineInCustomRemark.trim()] : [])];
    }
    const finalNote = finalRemarks.length > 0 ? finalRemarks.join(", ") : form.note;

    const orderData = {
      restaurantId,
      items,
      total: finalPrice,
      type,
      info: fullInfo,
      note: finalNote,
      remarks: finalRemarks,
      scheduled_for: type === "delivery" && deliveryTimeMode === "scheduled" ? reservationTime : "",
      user: userInfo,
      status: needsReview && dineInAction !== "add" ? "review_needed" : "pending",
      dineInAction,
      isAdmin,
    };

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      });
      const resData = await res.json();

      if (res.ok && resData.success) {
        if (resData.orderId) {
          localStorage.setItem("last_order_id", resData.orderId);
        }

        if (type === "dine_in") {
          try {
            if (window.parent && window.parent !== window) {
              window.parent.postMessage({ type: "ORDER_SUBMITTED", tableId: tableNum }, "*");
            }
          } catch {}

          clearCart();
          resetAllRemarks();

          if (dineInAction === "add") {
            alert("✅ 已加餐并合并到当前桌订单\nAdded and merged to current table order.");
            if (!isAdmin) redirectToTableSelector();
          } else if (dineInAction === "new") {
            alert("✅ 已新开订单，旧单已自动结账\nNew order created, previous table order auto-closed.");
            if (!isAdmin) redirectToTableSelector();
          } else if (needsReview) {
            alert("✅ 加菜请求已发送，请等待服务员确认。\nRequest sent, waiting for approval.");
            if (!isAdmin) redirectToTableSelector();
          } else {
            if (!isAdmin) redirectToTableSelector();
          }
          return;
        }

        if (type === "delivery") {
          saveUserInfo(form.name, form.phone, form.password, form.address);
        }

        const urlParams = new URLSearchParams(window.location.search);
        const isEmbed = urlParams.get("embed") === "1";

        clearCart();
        resetAllRemarks();
        setDeliveryTimeMode("asap");
        setReservationTime("");

        if (isEmbed) {
          window.parent.postMessage({ type: "ORDER_SUBMITTED", tableId: tableNum }, "*");
          if (type === "dine_in" && !isAdmin) {
            setTimeout(() => {
              redirectToTableSelector();
            }, 120);
            return;
          }
          return;
        }

        if (type === "delivery") {
          window.location.href = `/${restaurantId}?open=user`;
        }
      } else {
        let errMsg = resData.error || "Unknown Error";
        if (resData.details) {
          errMsg += "\n" + JSON.stringify(resData.details, null, 2);
        }
        alert(`❌ 下单失败 / Order Failed:\n${errMsg}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error";
      alert(`Network Error / Greška na mreži:\n${message}`);
    }
    setLoading(false);
  };

  return { submitOrder };
}
