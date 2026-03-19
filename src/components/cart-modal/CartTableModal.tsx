import { getRemarkCategoryTheme } from "../../lib/remark-ui-theme";

interface TableZone {
  name: string;
  count: number;
  prefix?: string;
}

interface RemarkCategory {
  name: string;
  options: string[];
}

interface CartTableModalProps {
  show: boolean;
  tableConfig: TableZone[];
  tableNumber: string;
  setTableNumber: (value: string) => void;
  simpleHallMode: boolean;
  buildTableValue: (zone: TableZone, index: number, simpleHallMode: boolean) => string;
  buildTableButtonLabel: (zone: TableZone, index: number, simpleHallMode: boolean) => string;
  remarkCategories: RemarkCategory[];
  showRemarksPanel: boolean;
  dineInRemarks: string[];
  dineInCustomRemark: string;
  onTogglePanel: () => void;
  onToggleRemark: (remark: string) => void;
  onCustomRemarkChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export default function CartTableModal({
  show,
  tableConfig,
  tableNumber,
  setTableNumber,
  simpleHallMode,
  buildTableValue,
  buildTableButtonLabel,
  remarkCategories,
  showRemarksPanel,
  dineInRemarks,
  dineInCustomRemark,
  onTogglePanel,
  onToggleRemark,
  onCustomRemarkChange,
  onClose,
  onConfirm,
}: CartTableModalProps) {
  if (!show) return null;

  return (
    <div className="modal-overlay center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="table-modal"
        style={{
          maxWidth: "800px",
          width: "95%",
          padding: "30px",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <div className="close-top">
          <button onClick={onClose}>×</button>
        </div>

        <h4 style={{ fontSize: "22px", marginBottom: "20px" }}>U restoranu / 堂食下单</h4>

        <div style={{ marginBottom: "25px" }}>
          <div
            className="subtitle"
            style={{
              marginBottom: "15px",
              fontSize: "16px",
              color: "#666",
              textAlign: "center",
            }}
          >
            {tableConfig && tableConfig.length > 0 ? "Izaberite sto / 请选择桌号" : "Broj stola / 请输入桌号"}
          </div>

          {tableConfig && tableConfig.length > 0 ? (
            <div className="table-zones-container" style={{ padding: "5px" }}>
              {tableConfig.map((zone, idx) => {
                const headerColor = ["#ff7043", "#4caf50", "#2196f3", "#ffa726", "#9c27b0", "#009688"][idx % 6];
                return (
                  <div key={idx} className="zone-section" style={{ marginBottom: "20px" }}>
                    <div
                      className="zone-title"
                      style={{
                        color: headerColor,
                        fontWeight: "bold",
                        fontSize: "16px",
                        marginBottom: "10px",
                        borderLeft: `4px solid ${headerColor}`,
                        paddingLeft: "10px",
                        textAlign: "left",
                      }}
                    >
                      {zone.name}
                    </div>
                    <div
                      className="zone-tables"
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(60px, 1fr))",
                        gap: "10px",
                      }}
                    >
                      {Array.from({ length: zone.count }).map((_, i) => {
                        const index = i + 1;
                        const tNum = buildTableValue(zone, index, simpleHallMode);
                        const displayNum = buildTableButtonLabel(zone, index, simpleHallMode);
                        const isSelected = tableNumber === tNum;
                        return (
                          <button
                            key={tNum}
                            onClick={() => setTableNumber(tNum)}
                            style={{
                              padding: "10px 5px",
                              borderRadius: "8px",
                              border: isSelected ? `2px solid ${headerColor}` : "1px solid #ddd",
                              background: isSelected ? `${headerColor}22` : "#fff",
                              color: isSelected ? headerColor : "#333",
                              fontWeight: isSelected ? "bold" : "normal",
                              cursor: "pointer",
                              fontSize: "16px",
                              transition: "all 0.2s",
                            }}
                          >
                            {displayNum}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: "center" }}>
              <input
                type="text"
                className="table-input"
                value={tableNumber}
                onInput={(e) => setTableNumber((e.target as HTMLInputElement).value)}
                placeholder="?"
                autoFocus
                style={{
                  fontSize: "36px",
                  textAlign: "center",
                  width: "120px",
                  padding: "10px",
                  border: "2px solid #4caf50",
                  borderRadius: "12px",
                  fontWeight: "bold",
                  color: "#333",
                }}
              />
            </div>
          )}
        </div>

        <div className="dine-remarks-section">
          <div className="remarks-toggle" onClick={onTogglePanel} style={{ padding: "15px 20px" }}>
            <span className="toggle-title" style={{ fontSize: "16px" }}>
              🏷️ Ukus / 口味备注 (选填)
            </span>
            <span className="toggle-icon">{showRemarksPanel ? "收起 ▲" : "展开选择 ▼"}</span>
          </div>

          <section className="remark-ui">
            {dineInRemarks.length > 0 && (
              <div className="remarks-preview">
                {dineInRemarks.map((remark) => (
                  <span key={remark} className="remark-tag">
                    {remark}
                    <button
                      type="button"
                      className="remark-remove"
                      aria-label={`移除备注：${remark}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleRemark(remark);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {showRemarksPanel && (
              <div className="remarks-panel">
                {remarkCategories.map((cat, idx) => {
                  const { accent, soft, icon } = getRemarkCategoryTheme(cat.name);
                  return (
                    <div
                      key={idx}
                      className="remark-category"
                      style={{ "--remark-accent": accent, "--remark-accent-soft": soft } as any}
                    >
                      <div className="category-title">
                        <span className="category-icon" aria-hidden="true">
                          {icon}
                        </span>
                        <span className="category-name">{cat.name}</span>
                      </div>
                      <div className="remark-options-grid">
                        {cat.options.map((opt) => {
                          const isSelected = dineInRemarks.includes(opt);
                          const [main, sub] = opt.split("/");
                          return (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => onToggleRemark(opt)}
                              className={`remark-option-btn ${isSelected ? "selected" : ""}`}
                            >
                              <span className="option-main">{main?.trim()}</span>
                              {sub && <span className="option-sub">{sub.trim()}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {(() => {
                  const { accent, soft, icon } = getRemarkCategoryTheme("自定义备注 / Custom");
                  return (
                    <div
                      className="remark-category"
                      style={{ "--remark-accent": accent, "--remark-accent-soft": soft } as any}
                    >
                      <div className="category-title">
                        <span className="category-icon" aria-hidden="true">
                          {icon}
                        </span>
                        <span className="category-name">自定义备注 / Custom</span>
                      </div>
                      <div className="remark-note-content">
                        <textarea
                          placeholder="其他特殊要求... / Other requests..."
                          value={dineInCustomRemark}
                          onInput={(e) => onCustomRemarkChange((e.target as HTMLTextAreaElement).value)}
                          className="form-field form-textarea"
                          rows={2}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </section>
        </div>

        <button className="cart-btn-dine" style={{ width: "100%", marginTop: "20px" }} onClick={onConfirm}>
          确认堂食下单 / Potvrdi porudzbinu za sto
        </button>
      </div>
    </div>
  );
}
