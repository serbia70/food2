import { clearCart } from "../../store/cartStore";

interface UseDineInTableFlowOptions {
  tableNumber: string;
  isTableLocked: boolean;
  dineInRemarks: string[];
  submitOrder: (
    type: "dine_in" | "delivery",
    paymentMethod: "cash" | "wechat",
    tableNum?: string,
    needsReview?: boolean,
    remarks?: string[],
  ) => void;
  setShowTableModal: (value: boolean) => void;
  resetAllRemarks: () => void;
}

export function useDineInTableFlow({
  tableNumber,
  isTableLocked,
  dineInRemarks,
  submitOrder,
  setShowTableModal,
  resetAllRemarks,
}: UseDineInTableFlowOptions) {
  const handleConfirmDineIn = () => {
    if (!tableNumber.trim()) {
      return alert("请输入桌号 / Unesite broj stola");
    }
    setShowTableModal(false);
    submitOrder("dine_in", "cash", tableNumber, isTableLocked, dineInRemarks);
  };

  const handleSwitchTable = () => {
    const confirmed = confirm(
      "切换桌号将清空购物车，确定吗？\n" +
        "Promena stola će očistiti korpu. Potvrdi?",
    );
    if (confirmed) {
      clearCart();
      resetAllRemarks();
      const url = new URL(window.location.href);
      url.searchParams.delete("table");
      window.location.href = url.toString();
    }
  };

  const openTableModal = () => {
    setShowTableModal(true);
  };

  const closeTableModal = () => {
    setShowTableModal(false);
  };

  return {
    handleConfirmDineIn,
    handleSwitchTable,
    openTableModal,
    closeTableModal,
  };
}
