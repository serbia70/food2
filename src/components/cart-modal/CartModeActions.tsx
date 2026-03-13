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

      {enableDelivery && !tableNumber && (
        <button
          className="cart-btn-delivery"
          onClick={onStartDelivery}
          disabled={totalCount === 0 || !isShopOpen || isDeliveryLocked}
          title={isDeliveryLocked ? deliveryLockReason : ""}
        >
          {isDeliveryLocked ? "🔒 外卖暂停" : "Dostava / 外卖"}
        </button>
      )}
    </div>
  );
}
