interface OrderForm {
  name: string;
  phone: string;
  password: string;
  address: string;
  note: string;
}

interface RemarkCategory {
  name: string;
  options: string[];
}

interface CartDeliveryFormProps {
  form: OrderForm;
  setForm: (value: OrderForm) => void;
  historyAddrs: string[];
  zones: string[];
  enableDelivery: boolean;
  deliveryTimeMode: "asap" | "scheduled";
  setDeliveryTimeMode: (value: "asap" | "scheduled") => void;
  reservationTime: string;
  setReservationTime: (value: string) => void;
  showDeliveryRemarksPanel: boolean;
  deliveryRemarks: string[];
  customRemark: string;
  remarkCategories: RemarkCategory[];
  loading: boolean;
  onToggleDeliveryPanel: () => void;
  onToggleDeliveryRemark: (remark: string) => void;
  onSetDeliveryCustomRemark: (value: string) => void;
  onSubmitOrder: (type: "delivery", paymentMethod: "cash" | "wechat") => void;
  onBack: () => void;
}

export default function CartDeliveryForm({
  form,
  setForm,
  historyAddrs,
  zones,
  enableDelivery,
  deliveryTimeMode,
  setDeliveryTimeMode,
  reservationTime,
  setReservationTime,
  showDeliveryRemarksPanel,
  deliveryRemarks,
  customRemark,
  remarkCategories,
  loading,
  onToggleDeliveryPanel,
  onToggleDeliveryRemark,
  onSetDeliveryCustomRemark,
  onSubmitOrder,
  onBack,
}: CartDeliveryFormProps) {
  return (
    <div className="delivery-form">
      <div className="field-label">Ime / 姓名 *:</div>
      <input
        type="text"
        placeholder="Your name / 您的姓名"
        value={form.name}
        onInput={(e) =>
          setForm({
            ...form,
            name: (e.target as HTMLInputElement).value,
          })
        }
        className="form-field"
      />

      <div className="field-label">Telefon / 手机 *:</div>
      <input
        type="tel"
        placeholder="Phone / 手机号"
        value={form.phone}
        onInput={(e) =>
          setForm({
            ...form,
            phone: (e.target as HTMLInputElement).value,
          })
        }
        className="form-field"
      />

      {historyAddrs.length > 0 && (
        <div className="addr-history">
          <div className="field-label">Istorija / 历史地址:</div>
          <div className="addr-chips">
            {historyAddrs.map((addr, i) => (
              <button
                key={i}
                className="addr-chip"
                onClick={() => setForm({ ...form, address: addr })}
              >
                📍 {addr}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="divider-or">ILI / 或</div>

      {zones.length > 0 && (
        <div className="zone-select">
          <div className="field-label">Grad / 区域 (Kliknite za odabir / 点击选择) *:</div>
          <div className="zone-btns">
            {zones.map((z, i) => (
              <button
                key={i}
                className="zone-chip"
                onClick={() => setForm({ ...form, address: z + ", " })}
              >
                {z}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field-label">Adresa / 地址 *:</div>
      <textarea
        placeholder="Detailed address / 详细地址..."
        value={form.address}
        onInput={(e) =>
          setForm({
            ...form,
            address: (e.target as HTMLTextAreaElement).value,
          })
        }
        className="form-field form-textarea"
        rows={2}
      />

      {enableDelivery && (
        <div
          className="reservation-box"
          style={{
            marginTop: "15px",
            background: "#f8fafc",
            padding: "10px",
            borderRadius: "8px",
            border: "1px solid #dbeafe",
          }}
        >
          <div className="field-label" style={{ color: "#0f172a" }}>
            🚚 配送时间 / Vreme dostave
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "8px",
              marginTop: "8px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setDeliveryTimeMode("asap");
                setReservationTime("");
              }}
              style={{
                border: deliveryTimeMode === "asap" ? "2px solid #16a34a" : "1px solid #cbd5e1",
                background: deliveryTimeMode === "asap" ? "#f0fdf4" : "#fff",
                color: deliveryTimeMode === "asap" ? "#166534" : "#334155",
                borderRadius: "8px",
                padding: "9px 10px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              🚀 尽快配送（默认）
            </button>
            <button
              type="button"
              onClick={() => setDeliveryTimeMode("scheduled")}
              style={{
                border: deliveryTimeMode === "scheduled" ? "2px solid #0284c7" : "1px solid #cbd5e1",
                background: deliveryTimeMode === "scheduled" ? "#eff6ff" : "#fff",
                color: deliveryTimeMode === "scheduled" ? "#075985" : "#334155",
                borderRadius: "8px",
                padding: "9px 10px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "13px",
              }}
            >
              📅 预约配送
            </button>
          </div>

          {deliveryTimeMode === "scheduled" && (
            <>
              <div className="field-label" style={{ color: "#1565c0", marginTop: "10px" }}>
                请选择送达时间 / Izaberite vreme dostave:
              </div>
              <input
                type="datetime-local"
                className="form-field"
                value={reservationTime}
                onInput={(e) => setReservationTime((e.target as HTMLInputElement).value)}
                style={{ background: "#fff" }}
              />
            </>
          )}
        </div>
      )}

      <div className="delivery-remarks-section">
        <div className="remarks-toggle" onClick={onToggleDeliveryPanel}>
          <span className="toggle-title">🏷️ 口味备注 (选填)</span>
          <span className="toggle-icon">{showDeliveryRemarksPanel ? "收起 ▲" : "展开选择 ▼"}</span>
        </div>

        {deliveryRemarks.length > 0 && (
          <div className="remarks-preview">
            {deliveryRemarks.map((remark) => (
              <span key={remark} className="remark-tag">
                {remark}
                <span
                  className="remark-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleDeliveryRemark(remark);
                  }}
                >
                  ×
                </span>
              </span>
            ))}
          </div>
        )}

        {showDeliveryRemarksPanel && (
          <div className="remarks-panel">
            {remarkCategories.map((cat, idx) => (
              <div key={idx} className="remark-category">
                <div className="remark-category-title">{cat.name}</div>
                <div className="remark-options-grid">
                  {cat.options.map((opt) => {
                    const isSelected = deliveryRemarks.includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => onToggleDeliveryRemark(opt)}
                        className={`remark-option-btn ${isSelected ? "selected" : ""}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="field-label">自定义备注 / Custom Note:</div>
      <div className="custom-remark-input">
        <textarea
          placeholder="其他特殊要求... / Other special requests..."
          value={customRemark}
          onInput={(e) => onSetDeliveryCustomRemark((e.target as HTMLTextAreaElement).value)}
          className="form-field form-textarea"
          rows={2}
        />
      </div>

      <div className="submit-btns">
        <button className="submit-cash" onClick={() => onSubmitOrder("delivery", "cash")} disabled={loading}>
          <span className="icon">🏠</span>
          <span className="label-main">货到付款</span>
          <span className="label-sub">Cash</span>
        </button>
        <button className="submit-wechat" onClick={() => onSubmitOrder("delivery", "wechat")} disabled={loading}>
          <span className="icon"></span>
          <span className="label-main">微信支付</span>
          <span className="label-sub">WeChat</span>
        </button>
      </div>

      <button className="back-btn" onClick={onBack}>
        ← 返回购物车 / Nazad u korpu
      </button>
    </div>
  );
}
