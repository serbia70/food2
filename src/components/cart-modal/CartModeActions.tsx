interface CartModeActionsProps {
  enableDineIn: boolean;
  enableDelivery: boolean;
  deliveryMode: boolean;
  tableNumber: string;
  isTableLocked: boolean;
  dineInRemarks: string[];
  totalCount: number;
  isShopOpen: boolean;
  isDeliveryLocked: boolean;
  deliveryLockReason: string;
  onSubmitOrder: (
    type: "dine_in" | "delivery",
    paymentMethod: "cash" | "wechat",
    tableNum?: string,
    needsReview?: boolean,
    remarks?: string[],
  ) => void;
  onOpenTableModal: () => void;
  onStartDelivery: () => void;
}

export default function CartModeActions({
  enableDineIn,
  enableDelivery,
  deliveryMode,
  tableNumber,
  isTableLocked,
  dineInRemarks,
  totalCount,
  isShopOpen,
  isDeliveryLocked,
  deliveryLockReason,
  onSubmitOrder,
  onOpenTableModal,
  onStartDelivery,
}: CartModeActionsProps) {
  const deliveryDisabled = totalCount === 0 || !isShopOpen || isDeliveryLocked || !enableDelivery;
  const deliveryLabel = !enableDelivery
    ? "Dostava nije dostupna / 外卖尚未开通"
    : isDeliveryLocked
      ? "🔒 外卖暂停"
      : "Dostava / 外卖";

  return (
    <div className="cart-action-btns">
      {enableDineIn && !deliveryMode && (
        <button
          className="cart-btn-dine"
          onClick={() => {
            if (tableNumber.trim()) {
              onSubmitOrder("dine_in", "cash", tableNumber, isTableLocked, dineInRemarks);
            } else {
              onOpenTableModal();
            }
          }}
          disabled={totalCount === 0 || !isShopOpen}
        >
          U restoranu / 堂食
        </button>
      )}

      {!tableNumber && (
        <button
          className="cart-btn-delivery"
          onClick={() => {
            if (deliveryDisabled) return;
            onStartDelivery();
          }}
          disabled={deliveryDisabled}
          title={!enableDelivery ? "" : isDeliveryLocked ? deliveryLockReason : ""}
        >
          {deliveryLabel}
        </button>
      )}
    </div>
  );
}
