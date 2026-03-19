import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { cartItems, cartTotal } from "../store/cartStore";
import { SHOP_EVENTS } from "../lib/events";

interface ReservationModalProps {
  restaurantId?: string | number;
  onClose?: () => void;
  requiresPreOrder?: boolean;
}

interface CartMenuItem {
  id: string | number;
  name: string;
  subName?: string;
  price: number;
  quantity: number;
}

interface MenuProduct {
  id: string | number;
  name: string;
  sub_name?: string;
  subName?: string;
  price: number;
  is_available?: number;
}

interface MenuCategoryRaw {
  id?: string | number;
  name?: string;
  sub_name?: string;
  subName?: string;
  products?: MenuProduct[];
}

interface MenuCategory {
  id: string;
  name: string;
  subName: string;
  products: MenuProduct[];
}

interface SelectedMenuItem {
  product_id: string | number;
  name: string;
  sub_name: string;
  price: number;
  quantity: number;
}

type PreOrderMode = "none" | "cart" | "menu";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocalDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatLocalTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function parseLocalDateTime(dateStr: string, timeStr: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const t = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!m || !t) return null;

  const y = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const hh = Number(t[1]);
  const mi = Number(t[2]);
  const dt = new Date(y, mm - 1, dd, hh, mi, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

export default function ReservationModal({ restaurantId, onClose, requiresPreOrder = false }: ReservationModalProps) {
  const $items = useStore(cartItems);
  const $total = useStore(cartTotal);

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [guestCount, setGuestCount] = useState(2);
  const [reservationDate, setReservationDate] = useState("");
  const [reservationTime, setReservationTime] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const dineType = "dine_in";
  const [remarks, setRemarks] = useState("");

  const [preOrderMode, setPreOrderMode] = useState<PreOrderMode>("none");
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuError, setMenuError] = useState("");
  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>([]);
  const [selectedMenuItems, setSelectedMenuItems] = useState<Record<string, SelectedMenuItem>>({});
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");
  const [showOnlySelected, setShowOnlySelected] = useState(false);

  const menuListRef = useRef<HTMLDivElement | null>(null);
  const categoryRefMap = useRef<Record<string, HTMLDivElement | null>>({});
  const scrollingByChipRef = useRef(false);

  const hasCartItems = useMemo(() => Object.keys($items).length > 0, [$items]);
  const minDate = useMemo(() => formatLocalDate(new Date()), []);
  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return formatLocalDate(d);
  }, []);

  const availablePreOrderModes: PreOrderMode[] = ["none", "cart", "menu"];

  const selectedMenuList = useMemo(
    () => Object.values(selectedMenuItems).filter((item) => item.quantity > 0),
    [selectedMenuItems],
  );

  const selectedMenuCount = useMemo(
    () => selectedMenuList.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [selectedMenuList],
  );

  const selectedMenuTotal = useMemo(
    () =>
      selectedMenuList.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0,
      ),
    [selectedMenuList],
  );

  const getSlug = () => String(restaurantId || window.location.pathname.split("/")[1] || "").trim();

  const buildReservationItems = () => {
    let itemsJson: Array<{
      product_id: string | number;
      name: string;
      sub_name: string;
      price: number;
      quantity: number;
    }> | null = null;

    if (preOrderMode === "cart" && hasCartItems) {
      itemsJson = Object.values($items).map((item: CartMenuItem) => ({
        product_id: item.id,
        name: item.name,
        sub_name: item.subName || "",
        price: item.price,
        quantity: item.quantity,
      }));
    } else if (preOrderMode === "menu" && selectedMenuList.length > 0) {
      itemsJson = selectedMenuList.map((item) => ({
        product_id: item.product_id,
        name: item.name,
        sub_name: item.sub_name,
        price: item.price,
        quantity: item.quantity,
      }));
    }

    return itemsJson;
  };

  const validateForm = (): boolean => {
    if (!reservationDate || !reservationTime) {
      alert("请选择预约时间 / Izaberite vreme rezervacije");
      return false;
    }
    if (!customerPhone || customerPhone.length < 6) {
      alert("请填写有效手机号 / Unesite vazeci broj telefona");
      return false;
    }
    if (guestCount < 1 || guestCount > 50) {
      alert("用餐人数需在1-50人之间 / Broj gostiju mora biti 1-50");
      return false;
    }

    const selectedTime = parseLocalDateTime(reservationDate, reservationTime);
    if (!selectedTime) {
      alert("请选择有效预约时间 / Izaberite ispravan datum i vreme");
      return false;
    }
    const minTime = new Date(Date.now() + 2 * 60 * 60 * 1000);
    if (selectedTime < minTime) {
      alert("预约时间需至少2小时后 / Rezervacija mora biti najmanje 2 sata unapred");
      return false;
    }

    return true;
  };

  useEffect(() => {
    const handleOpen = () => {
      setSearchKeyword("");
      setShowOnlySelected(false);
      setIsOpen(true);
    };
    window.addEventListener(SHOP_EVENTS.OPEN_RESERVATION, handleOpen);
    return () => window.removeEventListener(SHOP_EVENTS.OPEN_RESERVATION, handleOpen);
  }, []);

  useEffect(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 120);
    now.setSeconds(0, 0);
    const roundedMinutes = Math.ceil(now.getMinutes() / 15) * 15;
    if (roundedMinutes >= 60) {
      now.setHours(now.getHours() + 1, 0, 0, 0);
    } else {
      now.setMinutes(roundedMinutes, 0, 0);
    }
    setReservationDate(formatLocalDate(now));
    setReservationTime(formatLocalTime(now));
  }, []);

  useEffect(() => {
    if (!requiresPreOrder) return;
    if (preOrderMode === "none") {
      setPreOrderMode(hasCartItems ? "cart" : "menu");
      return;
    }
    if (preOrderMode === "cart" && !hasCartItems) {
      setPreOrderMode("menu");
    }
  }, [requiresPreOrder, preOrderMode, hasCartItems]);

  useEffect(() => {
    if (!isOpen || preOrderMode !== "menu" || menuCategories.length > 0 || menuLoading) return;

    const fetchMenu = async () => {
      setMenuError("");
      setMenuLoading(true);
      try {
        const slug = getSlug();
        const res = await fetch(`/${encodeURIComponent(slug)}/menu`);
        const data = await res.json().catch(() => []);
        if (!res.ok) throw new Error("菜单加载失败 / Ucitavanje menija nije uspelo");

        const rawCategories = Array.isArray(data) ? (data as MenuCategoryRaw[]) : [];
        const parsed = rawCategories
          .map((cat, idx) => {
            const products = (Array.isArray(cat?.products) ? cat.products : [])
              .filter((p) => Number(p?.is_available ?? 1) !== 0)
              .map((p) => ({
                id: p.id,
                name: String(p.name || "未命名菜品 / Bez naziva"),
                sub_name: String(p.sub_name || p.subName || ""),
                price: Number(p.price || 0),
                is_available: Number(p.is_available ?? 1),
              }));

            return {
              id: String(cat?.id ?? `cat-${idx}`),
              name: String(cat?.name || "分类 / Kategorija"),
              subName: String(cat?.sub_name || cat?.subName || ""),
              products,
            } as MenuCategory;
          })
          .filter((c) => c.products.length > 0);

        setMenuCategories(parsed);
      } catch (e: any) {
        setMenuError(e?.message || "菜单加载失败 / Ucitavanje menija nije uspelo");
      }
      setMenuLoading(false);
    };

    fetchMenu();
  }, [isOpen, preOrderMode, menuCategories.length, menuLoading]);

  const chipCategories = useMemo(() => {
    const key = searchKeyword.trim().toLowerCase();

    const hasKeyword = (p: MenuProduct) => {
      if (!key) return true;
      const text = `${p.name} ${p.sub_name || p.subName || ""}`.toLowerCase();
      return text.includes(key);
    };

    return menuCategories
      .map((cat) => {
        const products = cat.products.filter((p) => {
          if (!hasKeyword(p)) return false;
          if (!showOnlySelected) return true;
          return Number(selectedMenuItems[String(p.id)]?.quantity || 0) > 0;
        });
        return { ...cat, products };
      })
      .filter((cat) => cat.products.length > 0);
  }, [menuCategories, searchKeyword, showOnlySelected, selectedMenuItems]);

  useEffect(() => {
    if (chipCategories.length === 0) {
      setActiveCategoryId("all");
      return;
    }
    if (activeCategoryId === "all") return;
    if (!chipCategories.some((cat) => cat.id === activeCategoryId)) {
      setActiveCategoryId(chipCategories[0].id);
    }
  }, [chipCategories, activeCategoryId]);

  useEffect(() => {
    if (!isOpen || preOrderMode !== "menu") return;
    const container = menuListRef.current;
    if (!container || chipCategories.length === 0) return;

    const onScroll = () => {
      if (scrollingByChipRef.current) return;

      const scrollTop = container.scrollTop;
      if (scrollTop < 8) {
        setActiveCategoryId("all");
        return;
      }

      let currentId = chipCategories[0].id;
      for (const cat of chipCategories) {
        const section = categoryRefMap.current[cat.id];
        if (!section) continue;
        if (section.offsetTop - 24 <= scrollTop) {
          currentId = cat.id;
        } else {
          break;
        }
      }

      setActiveCategoryId((prev) => (prev === currentId ? prev : currentId));
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
  }, [isOpen, preOrderMode, chipCategories]);

  const scrollToCategory = (id: string) => {
    const container = menuListRef.current;
    if (!container) return;

    if (id === "all") {
      scrollingByChipRef.current = true;
      setActiveCategoryId("all");
      container.scrollTo({ top: 0, behavior: "smooth" });
      window.setTimeout(() => {
        scrollingByChipRef.current = false;
      }, 360);
      return;
    }

    const section = categoryRefMap.current[id];
    if (!section) return;

    scrollingByChipRef.current = true;
    setActiveCategoryId(id);
    container.scrollTo({ top: Math.max(0, section.offsetTop - 4), behavior: "smooth" });
    window.setTimeout(() => {
      scrollingByChipRef.current = false;
    }, 360);
  };

  const setMenuQty = (product: MenuProduct, nextQty: number) => {
    const key = String(product.id);
    setSelectedMenuItems((prev) => {
      const next = { ...prev };
      if (nextQty <= 0) {
        delete next[key];
        return next;
      }
      next[key] = {
        product_id: product.id,
        name: product.name,
        sub_name: String(product.sub_name || product.subName || ""),
        price: Number(product.price || 0),
        quantity: nextQty,
      };
      return next;
    });
  };

  const getMenuQty = (id: string | number) => Number(selectedMenuItems[String(id)]?.quantity || 0);

  const clearSelectedMenu = () => setSelectedMenuItems({});

  const retryLoadMenu = () => {
    setMenuCategories([]);
    setMenuError("");
    setMenuLoading(false);
    setPreOrderMode("menu");
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const reservationDateTime = `${reservationDate}T${reservationTime}:00`;
    const itemsJson = buildReservationItems();

    setLoading(true);
    const payload = {
      guest_count: guestCount,
      reservation_time: reservationDateTime,
      customer_phone: customerPhone,
      dine_type: "dine_in",
      delivery_address: null,
      customer_name: customerName || null,
      items: itemsJson,
      remarks: remarks || null,
    };

    try {
      const slug = getSlug();
      const res = await fetch("/api/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: slug, ...payload }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`❌ 预约失败 / Rezervacija nije uspela: ${data.error || "未知错误"}`);
        return;
      }

      try {
        const p = String(customerPhone || '').trim();
        const slug = String(getSlug() || '').trim();
        if (p && slug) {
          const key = `user_last_reservation:${p}:${slug}`;
          const stored = {
            reservation_id: data?.reservation_id || null,
            reservation_time: payload.reservation_time,
            guest_count: payload.guest_count,
            customer_phone: payload.customer_phone,
            created_at: new Date().toISOString(),
          };
          localStorage.setItem(key, JSON.stringify(stored));
        }
      } catch {}

      const dineTypeText = "堂食 / U restoranu";
      const preOrderText =
        preOrderMode === "none"
          ? "到店再点 / Narucivanje u lokalu"
          : `已预点 ${itemsJson?.length || 0} 个菜品 / Stavki: ${itemsJson?.length || 0}`;
      const reservationId = data?.reservation_id ? `\n预订号 / ID: ${data.reservation_id}` : "";

      alert(
        `✅ 预约成功 / Rezervacija uspesna!\n\n预约时间 / Vreme: ${reservationDate} ${reservationTime}\n用餐人数 / Broj gostiju: ${guestCount}\n用餐方式 / Nacin: ${dineTypeText}\n点餐方式 / Narucivanje: ${preOrderText}${reservationId}`,
      );

      setIsOpen(false);
      onClose?.();
    } catch (e: any) {
      alert(`网络错误 / Mrezna greska: ${e.message}`);
    }

    setLoading(false);
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay center"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(8, 20, 34, 0.55)",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: "#f6fbff",
          width: "100vw",
          height: "100dvh",
          overflowY: "auto",
          boxShadow: "0 24px 70px rgba(7, 24, 45, 0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px",
            borderBottom: "1px solid rgba(255,255,255,0.25)",
            background: "linear-gradient(120deg, #0f4c81 0%, #1a7fc2 100%)",
            color: "#fff",
            position: "sticky",
            top: 0,
            zIndex: 5,
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>📅 预约订餐 / Rezervacija</h3>
            <div style={{ marginTop: "4px", fontSize: "12px", opacity: 0.92 }}>
              一步完成 / Sve u jednom koraku
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "none",
              background: "rgba(255,255,255,0.2)",
              color: "#fff",
              fontSize: "22px",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: "16px", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
          <div style={{ borderRadius: "14px", border: "1px solid #dce9f6", background: "#fff", padding: "14px", marginBottom: "14px" }}>
            <div style={{ fontWeight: 700, color: "#123250", marginBottom: "10px" }}>
              基本信息 / Osnovni podaci
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, color: "#29445f" }}>
                用餐人数 * / Broj gostiju
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <button onClick={() => setGuestCount(Math.max(1, guestCount - 1))} style={{ width: "34px", height: "34px", borderRadius: "8px", border: "1px solid #d0deec", background: "#fff", cursor: "pointer" }}>-</button>
                <div style={{ minWidth: "56px", textAlign: "center", fontSize: "24px", fontWeight: 800, color: "#0f4c81" }}>{guestCount}</div>
                <button onClick={() => setGuestCount(Math.min(50, guestCount + 1))} style={{ width: "34px", height: "34px", borderRadius: "8px", border: "1px solid #d0deec", background: "#fff", cursor: "pointer" }}>+</button>
                <span style={{ color: "#59748e", fontSize: "13px" }}>人 / os.</span>
              </div>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, color: "#29445f" }}>
                预约时间 * / Vreme rezervacije
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <input type="date" value={reservationDate} min={minDate} max={maxDate} onChange={(e) => setReservationDate((e.target as HTMLInputElement).value)} style={{ width: "100%", padding: "11px", borderRadius: "10px", border: "1px solid #c9daeb", fontSize: "14px", boxSizing: "border-box" }} />
                <input type="time" value={reservationTime} onChange={(e) => setReservationTime((e.target as HTMLInputElement).value)} style={{ width: "100%", padding: "11px", borderRadius: "10px", border: "1px solid #c9daeb", fontSize: "14px", boxSizing: "border-box" }} />
              </div>
              <small style={{ color: "#6b8196", fontSize: "12px" }}>
                至少提前2小时，最多提前7天 / Najmanje 2h, najvise 7 dana unapred
              </small>
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, color: "#29445f" }}>
                手机号码 * / Telefon
              </label>
              <input type="tel" value={customerPhone} onInput={(e) => setCustomerPhone((e.target as HTMLInputElement).value)} placeholder="0612345678" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #c9daeb", fontSize: "15px", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: "12px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600, color: "#29445f" }}>
                姓名 (可选) / Ime (opciono)
              </label>
              <input type="text" value={customerName} onInput={(e) => setCustomerName((e.target as HTMLInputElement).value)} placeholder="您的称呼 / Vase ime" style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid #c9daeb", fontSize: "15px", boxSizing: "border-box" }} />
            </div>

            <div style={{ borderTop: "1px solid #eef3f8", paddingTop: "12px" }}>
              <div style={{ fontWeight: 700, color: "#123250", marginBottom: "10px" }}>
                用餐方式 / Nacin
              </div>
              <div style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #cfe2d6", background: "#edf8f1", color: "#245f3d", fontWeight: 700, fontSize: "13px" }}>
                🪑 仅支持堂食预约 / Samo rezervacija u lokalu
              </div>
            </div>
          </div>

          <div style={{ borderRadius: "14px", border: "1px solid #dce9f6", background: "#fff", padding: "14px", marginBottom: "14px" }}>
            <div style={{ fontWeight: 700, color: "#123250", marginBottom: "8px" }}>
              预约点餐 / Izbor jela
            </div>
            <div style={{ fontSize: "12px", color: "#6b8196", marginBottom: "10px" }}>
              可先点菜，也可到店再点 / Mozete izabrati sada ili u lokalu
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px", marginBottom: "10px" }}>
              {availablePreOrderModes.includes("none") && (
                <button onClick={() => setPreOrderMode("none")} style={{ textAlign: "left", padding: "10px 12px", borderRadius: "10px", border: preOrderMode === "none" ? "2px solid #2f9a7f" : "1px solid #d8e3ee", background: preOrderMode === "none" ? "#e8f8f3" : "#fff", cursor: "pointer", fontWeight: preOrderMode === "none" ? 700 : 500, color: "#31506a" }}>到店再点 / Narucivanje u lokalu</button>
              )}
              <button onClick={() => setPreOrderMode("cart")} disabled={!hasCartItems} style={{ textAlign: "left", padding: "10px 12px", borderRadius: "10px", border: preOrderMode === "cart" ? "2px solid #1a7fc2" : "1px solid #d8e3ee", background: preOrderMode === "cart" ? "#e8f4fd" : "#fff", cursor: hasCartItems ? "pointer" : "not-allowed", opacity: hasCartItems ? 1 : 0.55, fontWeight: preOrderMode === "cart" ? 700 : 500, color: "#31506a" }}>使用当前购物车 / Koristi korpu ({$total.count} kom, {$total.price} RSD)</button>
              <button onClick={() => setPreOrderMode("menu")} style={{ textAlign: "left", padding: "10px 12px", borderRadius: "10px", border: preOrderMode === "menu" ? "2px solid #f19a2a" : "1px solid #d8e3ee", background: preOrderMode === "menu" ? "#fff4e8" : "#fff", cursor: "pointer", fontWeight: preOrderMode === "menu" ? 700 : 500, color: "#31506a" }}>从菜单选择 / Izaberi iz menija</button>
            </div>

            {preOrderMode === "cart" && hasCartItems && (
              <div style={{ background: "#f7fbff", border: "1px solid #ddebf8", borderRadius: "10px", padding: "10px", fontSize: "13px", color: "#3b536a" }}>
                {Object.values($items)
                  .map((i: CartMenuItem) => `${i.name} x${i.quantity}`)
                  .join("，")}
              </div>
            )}

            {preOrderMode === "menu" && (
              <div>
                <div style={{ marginBottom: "8px" }}>
                  <input type="text" value={searchKeyword} onInput={(e) => setSearchKeyword((e.target as HTMLInputElement).value)} placeholder="搜索菜品 / Pretraga" style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #d1deea", fontSize: "14px", boxSizing: "border-box" }} />
                </div>

                <div style={{ position: "sticky", top: 0, zIndex: 2, background: "#fff", paddingBottom: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "2px" }}>
                    <button onClick={() => scrollToCategory("all")} style={{ whiteSpace: "nowrap", padding: "6px 12px", borderRadius: "999px", border: activeCategoryId === "all" ? "1px solid #1a7fc2" : "1px solid #d6e1ec", background: activeCategoryId === "all" ? "#e8f4fd" : "#fff", color: activeCategoryId === "all" ? "#166ca6" : "#45617b", fontWeight: activeCategoryId === "all" ? 700 : 500, cursor: "pointer", fontSize: "12px" }}>全部 / Sve</button>
                    {chipCategories.map((cat) => (
                      <button key={cat.id} onClick={() => scrollToCategory(cat.id)} style={{ whiteSpace: "nowrap", padding: "6px 12px", borderRadius: "999px", border: activeCategoryId === cat.id ? "1px solid #1a7fc2" : "1px solid #d6e1ec", background: activeCategoryId === cat.id ? "#e8f4fd" : "#fff", color: activeCategoryId === cat.id ? "#166ca6" : "#45617b", fontWeight: activeCategoryId === cat.id ? 700 : 500, cursor: "pointer", fontSize: "12px" }}>{cat.name}</button>
                    ))}
                  </div>
                </div>

                {menuLoading && <div style={{ color: "#6b8196", fontSize: "13px", padding: "8px 0" }}>正在加载菜单 / Ucitavanje menija...</div>}

                {!menuLoading && menuError && (
                  <div style={{ fontSize: "13px", color: "#c62828", background: "#ffebee", border: "1px solid #ffd0d0", borderRadius: "10px", padding: "10px" }}>
                    {menuError}
                    <button onClick={retryLoadMenu} style={{ marginLeft: "8px", border: "1px solid #c62828", background: "#fff", color: "#c62828", borderRadius: "6px", padding: "3px 8px", cursor: "pointer" }}>重试 / Ponovo</button>
                  </div>
                )}

                {!menuLoading && !menuError && (
                  <div ref={menuListRef} style={{ maxHeight: "48vh", overflowY: "auto", border: "1px solid #dde8f3", borderRadius: "10px", background: "#fdfefe" }}>
                    {chipCategories.length === 0 ? (
                      <div style={{ padding: "12px", color: "#6b8196", fontSize: "13px" }}>暂无匹配菜品 / Nema rezultata</div>
                    ) : (
                      chipCategories.map((cat) => (
                        <div key={cat.id} ref={(el) => {
                          categoryRefMap.current[cat.id] = el;
                        }}>
                          <div style={{ position: "sticky", top: 0, background: "#f3f8fc", color: "#33556f", padding: "8px 10px", fontSize: "12px", fontWeight: 700, borderBottom: "1px solid #e4edf5" }}>
                            {cat.name} {cat.subName ? `/ ${cat.subName}` : ""}
                          </div>
                          {cat.products.map((p) => {
                            const qty = getMenuQty(p.id);
                            return (
                              <div key={String(p.id)} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #edf2f8" }}>
                                <div>
                                  <div style={{ fontWeight: 600, color: "#2a4258", fontSize: "13px" }}>{p.name}</div>
                                  <div style={{ color: "#73879a", fontSize: "12px" }}>{p.sub_name || p.subName || "-"}</div>
                                  <div style={{ color: "#166ca6", fontSize: "12px", fontWeight: 700 }}>{Number(p.price || 0)} RSD</div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <button onClick={() => setMenuQty(p, qty - 1)} style={{ width: "26px", height: "26px", borderRadius: "7px", border: "1px solid #d0dce8", background: "#fff", cursor: "pointer" }}>-</button>
                                  <span style={{ minWidth: "18px", textAlign: "center", fontSize: "13px", fontWeight: 700 }}>{qty}</span>
                                  <button onClick={() => setMenuQty(p, qty + 1)} style={{ width: "26px", height: "26px", borderRadius: "7px", border: "1px solid #d0dce8", background: "#fff", cursor: "pointer" }}>+</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {selectedMenuCount > 0 && (
                  <div style={{ position: "sticky", bottom: 0, zIndex: 3, marginTop: "10px", background: "#0f4c81", color: "#fff", borderRadius: "12px", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <div style={{ fontSize: "13px" }}>
                      已选 {selectedMenuCount} 件 / {selectedMenuCount} kom · {selectedMenuTotal} RSD
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button onClick={() => setShowOnlySelected((v) => !v)} style={{ border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.16)", color: "#fff", borderRadius: "8px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>{showOnlySelected ? "看全部 / Sve" : "只看已选 / Izabrano"}</button>
                      <button onClick={clearSelectedMenu} style={{ border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.16)", color: "#fff", borderRadius: "8px", padding: "4px 8px", fontSize: "12px", cursor: "pointer" }}>清空 / Obrisi</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <section className="remark-ui">
            <div className="remark-category">
              <div className="category-title">
                <span className="category-icon" aria-hidden="true">🏷️</span>
                <span className="category-name">备注 (可选) / Napomena (opciono)</span>
              </div>
              <div className="remark-note-content">
                <textarea
                  value={remarks}
                  onInput={(e) => setRemarks((e.target as HTMLTextAreaElement).value)}
                  placeholder="特殊要求... / Posebni zahtevi..."
                  rows={3}
                />
              </div>
            </div>
          </section>

          <div style={{ position: "sticky", bottom: 0, marginTop: "14px", paddingTop: "8px", background: "linear-gradient(180deg, rgba(246,251,255,0) 0%, #f6fbff 26%)", paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}>
            <button onClick={handleSubmit} disabled={loading} style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", border: "none", background: loading ? "#b9c3cf" : "linear-gradient(120deg, #0f4c81 0%, #1a7fc2 100%)", color: "#fff", fontSize: "16px", fontWeight: 800, cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 10px 24px rgba(15, 76, 129, 0.35)" }}>
              {loading ? "提交中... / Slanje..." : "确认预约 / Potvrdi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
