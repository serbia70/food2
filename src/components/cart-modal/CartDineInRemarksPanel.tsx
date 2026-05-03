import { getRemarkCategoryTheme } from "../../lib/remark-ui-theme";

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
    <div className="delivery-remarks-section">
      <div className="remarks-toggle" onClick={onTogglePanel}>
        <span className="toggle-title">🏷️ 口味备注 (选填)</span>
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
  );
}
