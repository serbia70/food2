interface RemarkCategory {
  name: string;
  options: string[];
}

interface CartDineInRemarksPanelProps {
  showRemarksPanel: boolean;
  dineInRemarks: string[];
  dineInCustomRemark: string;
  remarkCategories: RemarkCategory[];
  onTogglePanel: () => void;
  onToggleRemark: (remark: string) => void;
  onCustomRemarkChange: (value: string) => void;
}

export default function CartDineInRemarksPanel({
  showRemarksPanel,
  dineInRemarks,
  dineInCustomRemark,
  remarkCategories,
  onTogglePanel,
  onToggleRemark,
  onCustomRemarkChange,
}: CartDineInRemarksPanelProps) {
  return (
    <div className="cart-remarks-section">
      <div className="cart-remarks-toggle" onClick={onTogglePanel}>
        <span>🏷️ Ukus / 口味备注 (选填)</span>
        <span className="toggle-icon">{showRemarksPanel ? "收起 ▲" : "展开选择 ▼"}</span>
      </div>

      {dineInRemarks.length > 0 && (
        <div className="cart-remarks-preview">
          {dineInRemarks.map((remark) => (
            <span key={remark} className="cart-remark-tag">
              {remark}
              <span
                className="cart-remark-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleRemark(remark);
                }}
              >
                ×
              </span>
            </span>
          ))}
        </div>
      )}

      {showRemarksPanel && (
        <div className="remarks-panel">
          {remarkCategories.map((cat, idx) => (
            <div key={idx} className="remark-category">
              <div className="remark-category-title">{cat.name}</div>
              <div className="remark-options-grid">
                {cat.options.map((opt) => {
                  const isSelected = dineInRemarks.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => onToggleRemark(opt)}
                      className={`remark-option-btn ${isSelected ? "selected" : ""}`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="remark-category" style={{ marginTop: "20px" }}>
            <div className="remark-category-title">自定义备注 / Custom</div>
            <div className="custom-remark-input">
              <textarea
                placeholder="其他特殊要求... / Other requests..."
                value={dineInCustomRemark}
                onInput={(e) => onCustomRemarkChange((e.target as HTMLTextAreaElement).value)}
                className="form-field form-textarea"
                rows={2}
                style={{ width: "100%", marginTop: "5px" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
