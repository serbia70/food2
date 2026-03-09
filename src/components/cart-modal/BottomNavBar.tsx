import { useEffect, useState } from "preact/hooks";
import { SHOP_EVENTS } from "../../lib/events";

interface BottomNavBarProps {
  tableNumber: string;
  totalPrice: number;
  totalCount: number;
  enableReservation?: boolean;
  onOpenCart: () => void;
}

export default function BottomNavBar({
  tableNumber,
  totalPrice,
  totalCount,
  enableReservation = false,
  onOpenCart,
}: BottomNavBarProps) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const showCartBadge = hydrated && totalCount > 0;

  return (
    <div className="bottom-nav-bar">
      <div className="nav-left-group">
        {!tableNumber && enableReservation && (
          <button
            type="button"
            className="nav-reserve-entry"
            onClick={() => window.dispatchEvent(new Event(SHOP_EVENTS.OPEN_RESERVATION))}
          >
            <span className="nav-reserve-main">📅 预订 / Rezervacija</span>
          </button>
        )}
      </div>

      <div className="nav-right-group">
        <button
          className="nav-btn nav-user"
          onClick={() => window.dispatchEvent(new Event(SHOP_EVENTS.OPEN_USER_MODAL))}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>

        <div className="nav-price-display" onClick={onOpenCart}>
          <span className="price-num">{totalPrice.toLocaleString()}</span>
          <span className="price-unit">RSD</span>
        </div>

        <button className="nav-btn nav-cart" onClick={onOpenCart}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle cx="9" cy="21" r="1" />
            <circle cx="20" cy="21" r="1" />
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
          </svg>
          <span
            className="nav-cart-badge"
            style={{ display: showCartBadge ? "inline-flex" : "none" }}
          >
            {showCartBadge ? totalCount : 0}
          </span>
        </button>
      </div>
    </div>
  );
}
