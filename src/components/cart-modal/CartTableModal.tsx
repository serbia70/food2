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

          {dineInRemarks.length > 0 && (
            <div className="remarks-preview" style={{ padding: "15px 20px" }}>
              {dineInRemarks.map((r) => (
                <span key={r} className="remark-tag" style={{ fontSize: "14px", padding: "8px 12px" }}>
                  {r}{" "}
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleRemark(r);
                    }}
                    className="remark-remove"
                  >
                    ×
                  </span>
                </span>
              ))}
            </div>
          )}

          {showRemarksPanel && (
            <div className="remarks-panel" style={{ maxHeight: "400px", padding: "10px" }}>
              {remarkCategories.map((cat, idx) => {
                let headerColor = "#607d8b";
                const n = cat.name;
                if (n.includes("辣") || n.includes("Spiciness")) headerColor = "#ff7043";
                else if (n.includes("忌口") || n.includes("Exclusions")) headerColor = "#d32f2f";
                else if (n.includes("健康") || n.includes("Healthy")) headerColor = "#4caf50";
                else if (n.includes("过敏") || n.includes("Allergies")) headerColor = "#ffa726";
                else if (n.includes("修改") || n.includes("Modifications")) headerColor = "#2196f3";

                return (
                  <div key={idx} className="remark-category" style={{ marginBottom: "20px" }}>
                    <div
                      className="category-title"
                      style={{
                        backgroundColor: headerColor,
                        color: "white",
                        padding: "10px 15px",
                        borderRadius: "8px 8px 0 0",
                        fontWeight: "bold",
                        fontSize: "15px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      {headerColor === "#ff7043" && "🌶️"}
                      {headerColor === "#d32f2f" && "🚫"}
                      {headerColor === "#4caf50" && "🥬"}
                      {cat.name}
                    </div>
                    <div
                      className="remark-options-grid"
                      style={{
                        border: `1px solid ${headerColor}`,
                        borderTop: "none",
                        borderRadius: "0 0 8px 8px",
                        padding: "15px",
                        background: "#fff",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                        gap: "10px",
                      }}
                    >
                      {cat.options.map((opt) => {
                        const isSelected = dineInRemarks.includes(opt);
                        const [mainText, subText] = opt.split("/");
                        return (
                          <button
                            key={opt}
                            onClick={() => onToggleRemark(opt)}
                            className={`remark-option-btn ${isSelected ? "selected" : ""}`}
                            style={{
                              minHeight: "45px",
                              borderColor: isSelected ? headerColor : "#e0e0e0",
                              backgroundColor: isSelected ? `${headerColor}15` : "#fff",
                              color: isSelected ? headerColor : "#333",
                            }}
                          >
                            <span className="opt-main" style={{ fontSize: "14px", fontWeight: isSelected ? "bold" : "normal" }}>
                              {mainText}
                            </span>
                            {subText && (
                              <span className="opt-sub" style={{ fontSize: "11px", color: isSelected ? headerColor : "#999" }}>
                                {subText}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div className="remark-category" style={{ marginTop: "20px", marginBottom: "15px" }}>
                <div
                  className="category-title"
                  style={{
                    backgroundColor: "#607d8b",
                    color: "white",
                    padding: "10px 15px",
                    borderRadius: "8px 8px 0 0",
                    fontWeight: "bold",
                    fontSize: "15px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  📝 自定义备注 / Custom
                </div>
                <div
                  style={{
                    border: "1px solid #607d8b",
                    borderTop: "none",
                    borderRadius: "0 0 8px 8px",
                    padding: "15px",
                    background: "#fff",
                  }}
                >
                  <textarea
                    placeholder="其他特殊要求... / Other requests..."
                    value={dineInCustomRemark}
                    onInput={(e) => onCustomRemarkChange((e.target as HTMLTextAreaElement).value)}
                    style={{
                      width: "100%",
                      padding: "10px",
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      fontSize: "14px",
                      resize: "vertical",
                      minHeight: "60px",
                    }}
                    rows={2}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <button className="cart-btn-dine" style={{ width: "100%", marginTop: "20px" }} onClick={onConfirm}>
          确认堂食下单 / Potvrdi porudzbinu za sto
        </button>
      </div>
    </div>
  );
}
