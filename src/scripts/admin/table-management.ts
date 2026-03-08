// 全局变量
let currentTableNum: string | null = null;
let currentTableOrders: any[] = [];
let currentRemarkOrderId: string | null = null;

function refreshAdminOrdersView() {
  const refreshFromRegistry =
    (window as any).__adminHandlers?.refreshOrderList || null;
  const refreshFromWindow = (window as any).refreshOrderList || null;
  const refresh =
    typeof refreshFromRegistry === "function"
      ? refreshFromRegistry
      : typeof refreshFromWindow === "function"
        ? refreshFromWindow
        : null;
  if (typeof refresh !== "function") return false;
  refresh();
  return true;
}

interface RemarkCategory {
  name: string;
  options: string[];
}

// 备注分类配置
const remarkCategories: RemarkCategory[] = [
  {
    name: "辣度与口味 (Spiciness & Flavor)",
    options: [
      "免辣/No Spicy",
      "微辣/Mild",
      "中辣/Medium",
      "特辣/Extra Hot",
      "少油/Less Oil",
      "少盐/Less Salt",
      "酸甜/Sweet & Sour",
    ],
  },
  {
    name: "忌口/不吃 (Exclusions)",
    options: [
      "免香菜/No Coriander",
      "免葱/No Onion",
      "免蒜/No Garlic",
      "免姜/No Ginger",
      "免芝麻/No Sesame",
      "不要豆芽/No Bean Sprouts",
      "免坚果/No Nuts",
    ],
  },
  {
    name: "健康与调味 (Healthy & Seasoning)",
    options: [
      "少糖/Less Sugar",
      "少酱/Less Sauce",
      "免味精/No MSG",
      "少醋/Less Vinegar",
      "多汁/More Sauce",
      "免酱油/No Soy Sauce",
    ],
  },
  {
    name: "过敏/特殊 (Allergies)",
    options: [
      "花生过敏/Peanut Allergy",
      "海鲜过敏/Seafood Allergy",
      "鸡蛋过敏/Egg Allergy",
      "麸质过敏/Gluten Allergy",
      "甲壳过敏/Shellfish Allergy",
    ],
  },
  {
    name: "食材调整 (Modifications)",
    options: [
      "去皮/No Skin",
      "去骨/No Bone",
      "加蛋/Add Egg",
      "加饭/Extra Rice",
      "加面/Extra Noodles",
      "加肉/Extra Meat",
      "高温/Extra Hot Temp",
    ],
  },
];

// 辅助函数：从 DOM 获取桌号订单
function parseTableRef(input: string) {
  const raw = String(input || "").trim();
  if (!raw) {
    return { area: "", number: "", key: "" };
  }

  const cleaned = raw.replace(/\s*(号桌|桌号|桌)\s*$/u, "").trim();
  const m = cleaned.match(/^(.*?)\s*(\d+)$/u);
  if (!m) {
    const areaOnly = cleaned.replace(/\s+/g, "").toLowerCase();
    return { area: areaOnly, number: "", key: areaOnly };
  }

  const area = String(m[1] || "")
    .replace(/\s+/g, "")
    .toLowerCase();
  const number = String(Number(m[2] || "0") || m[2]);
  return { area, number, key: `${area}${number}` };
}

function inferLegacySimpleHallNumber(raw: string, maxCount: number): string {
  const compact = String(raw || "").replace(/\s+/g, "").trim();
  if (!compact) {
    return "";
  }

  const ref = parseTableRef(compact);
  const isHallArea =
    ref.area === "" ||
    ref.area === "大厅" ||
    ref.area === "大堂" ||
    ref.area === "hall" ||
    ref.area === "mainhall" ||
    /^区域\d+$/u.test(ref.area);
  if (ref.number && isHallArea) {
    return ref.number;
  }

  if (!/^区域\d+$/u.test(compact) || maxCount <= 0) {
    return "";
  }

  let best = "";
  for (let n = 1; n <= maxCount; n++) {
    const s = String(n);
    if (compact.endsWith(s) && s.length >= best.length) {
      best = s;
    }
  }
  return best;
}

function getOrdersForTable(tableNum: string) {
  const targetRef = parseTableRef(String(tableNum || ""));
  const maxConfiguredTable = Array.from(
    document.querySelectorAll<HTMLElement>(".table-card-wide[data-table]"),
  ).reduce((max, el) => {
    const t = String(el.dataset.table || "");
    const num = Number.parseInt(
      (t.match(/(\d+)(?:号桌)?$/) || ["", "0"])[1],
      10,
    );
    return Number.isFinite(num) && num > max ? num : max;
  }, 0);
  const allOrders = document.querySelectorAll<HTMLElement>(".hidden-data");
  const tableOrders: any[] = [];

  allOrders.forEach((el) => {
    const status = el.dataset.status || "pending";
    // 忽略已完成或已取消的订单
    if (
      status === "completed" ||
      status === "cancelled" ||
      status === "archived"
    )
      return;

    const tableInfo = el.dataset.table || "";
    const orderRef = parseTableRef(tableInfo);
    const sameExact =
      !!(targetRef.key && orderRef.key && targetRef.key === orderRef.key);
    const sameNumberWithCompatibleArea =
      !!(
        targetRef.number &&
        orderRef.number &&
        targetRef.number === orderRef.number &&
        (targetRef.area === orderRef.area ||
          (!targetRef.area && !orderRef.area))
      );
    const singleRoomLegacyMatch =
      !!(
        !targetRef.number &&
        targetRef.area &&
        orderRef.area &&
        targetRef.area === orderRef.area
      );
    const legacySimpleHallMatch =
      !!(
        !targetRef.area &&
        targetRef.number &&
        inferLegacySimpleHallNumber(tableInfo, maxConfiguredTable) ===
          targetRef.number
      );

    if (
      sameExact ||
      sameNumberWithCompatibleArea ||
      singleRoomLegacyMatch ||
      legacySimpleHallMatch
    ) {
      // 解析 items
      let items: any[] = [];
      try {
        const parsed = JSON.parse(el.dataset.items || "[]");
        if (Array.isArray(parsed)) {
          items = parsed.filter((i: any) => i != null);
        } else if (typeof parsed === "object" && parsed !== null) {
          items = Object.values(parsed).filter((i: any) => i != null);
        }
      } catch (e) {}

      // 解析 remarks
      let remarks: string[] = [];
      try {
        const r = JSON.parse(el.dataset.remarks || "[]");
        if (Array.isArray(r)) remarks = r;
        else if (el.dataset.remarks) remarks = [el.dataset.remarks];
      } catch (e) {}

      // 查找时间 (在 DOM 中往上找)
      let time = "--:--";
      const card = el.closest(".order-card");
      if (card) {
        const timeEl = card.querySelector<HTMLElement>(".order-time");
        if (timeEl) time = timeEl.innerText;
      }

      tableOrders.push({
        id: el.dataset.oid,
        order_no: el.dataset.orderNo,
        amount: el.dataset.total,
        items: items,
        remarks: remarks, // 保存备注
        time: time,
        summary: items.filter((i: any) => i).map((i: any) => `${i.name} x${i.quantity}`).join(", "),
        element: el, // 保存 DOM 元素引用，用于 handleEditOrder
      });
    }
  });

  return tableOrders;
}

// ================== 1. 结账逻辑 ==================

export function handleTableCheckout(tableNum: string) {
  currentTableNum = tableNum;
  const orders = getOrdersForTable(tableNum);

  if (orders.length === 0) {
    alert(
      '该桌号没有在当前列表中找到订单。\n(请确保订单已加载在"订单"标签页中)',
    );
    return;
  }

  currentTableOrders = orders;
  const orderIds = orders.map((o) => String(o.id));
  void performCheckout(orderIds);
}

function showCheckoutModal(tableNum: string, orders: any[]) {
  const modal = document.getElementById("checkout-modal");
  if (!modal) return;

  const numEl = document.getElementById("checkout-table-num");
  if (numEl) numEl.textContent = `(桌号 ${tableNum})`;

  const listEl = document.getElementById("checkout-order-list");
  if (listEl) {
    listEl.innerHTML = orders
      .map((order) => {
        const itemsDetail = order.items
          .filter((i: any) => i != null)
          .map(
            (i: any) =>
              `${i.name} ${i.sub_name ? "(" + i.sub_name + ")" : ""} x${i.quantity}`,
          )
          .join(", ");

        return `
            <div style="display:flex; align-items:center; padding:10px; border-bottom:1px solid #eee;">
                <input type="checkbox" class="checkout-checkbox" value="${order.id}" checked onchange="window.updateCheckoutTotal()" style="width:20px; height:20px; margin-right:10px; cursor:pointer;">
                <div style="flex:1;">
                    <div style="font-weight:bold;">${order.time} <span style="font-weight:normal; color:#666;">(#${order.order_no})</span></div>
                    <div style="font-size:12px; color:#555;">${itemsDetail}</div>
                </div>
                <div style="font-weight:bold; color:#d32f2f;">${order.amount} RSD</div>
            </div>
        `;
      })
      .join("");
  }

  updateCheckoutTotal();
  modal.style.display = "flex";
}

export function updateCheckoutTotal() {
  const checkboxes = document.querySelectorAll<HTMLInputElement>(
    ".checkout-checkbox:checked",
  );
  let total = 0;
  checkboxes.forEach((cb) => {
    const order = currentTableOrders.find((o) => o.id == cb.value);
    if (order) total += parseFloat(order.amount) || 0;
  });
  const totalEl = document.getElementById("checkout-total-amount");
  if (totalEl) totalEl.textContent = total.toString();
}

export function closeCheckoutModal() {
  const modal = document.getElementById("checkout-modal");
  if (modal) modal.style.display = "none";
}

export async function confirmCheckout() {
  const checkboxes = document.querySelectorAll<HTMLInputElement>(
    ".checkout-checkbox:checked",
  );
  if (checkboxes.length === 0) return alert("请至少选择一个订单");

  const orderIds = Array.from(checkboxes).map((cb) => cb.value);
  await performCheckout(orderIds);
}

async function performCheckout(orderIds: string[]) {
  console.log("Checkout Order IDs:", orderIds);
  const restaurantId = window.location.pathname.split("/")[2];

  try {
    const res = await fetch("/api/admin/tables/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId,
        tableNumber: currentTableNum,
        orderIds: orderIds,
      }),
    });

    const data = await res.json();
    if (data.success) {
      if ((window as any).showToast) {
        (window as any).showToast(
          `结账成功：${orderIds.length} 单，${data.totalAmount} RSD`,
        );
      }
      closeCheckoutModal();
      refreshAdminOrdersView();
      if (window.loadOrderStats) {
        window.loadOrderStats();
      }
    } else {
      alert("结账失败: " + data.error);
    }
  } catch (error: any) {
    alert("网络错误: " + error.message);
  }
}

// ================== 2. 备注逻辑 ==================

export function handleTableRemarks(
  tableNum: string,
  orderId: string | null = null,
) {
  currentTableNum = tableNum;
  currentRemarkOrderId = orderId; // 保存订单ID

  const modal = document.getElementById("remarks-modal");
  if (!modal) return;

  const numEl = document.getElementById("remarks-table-num");
  if (numEl) {
    if (orderId) {
      numEl.textContent = `(订单 #${orderId})`;
    } else {
      numEl.textContent = `(桌号 ${tableNum})`;
    }
  }

  const customInput = document.getElementById(
    "custom-remarks",
  ) as HTMLInputElement;
  if (customInput) customInput.value = "";
  renderRemarksUI();
  modal.style.display = "flex";
}

function renderRemarksUI() {
  const container = document.getElementById("remarks-container");
  if (!container) return;

  container.innerHTML = remarkCategories
    .map((cat) => {
      let headerColor = "#607d8b";
      const n = cat.name;
      let icon = "";

      if (n.includes("辣") || n.includes("Spiciness")) {
        headerColor = "#ff7043";
        icon = "🌶️";
      } else if (n.includes("忌口") || n.includes("Exclusions")) {
        headerColor = "#d32f2f";
        icon = "🚫";
      } else if (n.includes("健康") || n.includes("Healthy")) {
        headerColor = "#4caf50";
        icon = "🥬";
      } else if (n.includes("过敏") || n.includes("Allergies")) {
        headerColor = "#ffa726";
        icon = "⚠️";
      } else if (n.includes("修改") || n.includes("Modifications")) {
        headerColor = "#2196f3";
        icon = "⚙️";
      }

      return `
          <div class="remark-category" style="margin-bottom: 20px;">
            <div class="category-title" style="background-color: ${headerColor}; color: white; padding: 10px 15px; border-radius: 8px 8px 0 0; font-weight: bold; font-size: 15px; display: flex; align-items: center; gap: 8px;">
               ${icon} ${cat.name}
            </div>
            <div class="remark-options-grid" style="border: 1px solid ${headerColor}; border-top: none; border-radius: 0 0 8px 8px; padding: 15px; background: #fff; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px;">
              ${cat.options
                .map((opt) => {
                  const [mainText, subText] = opt.split("/");
                  return `
                  <button onclick="window.toggleRemark(this, '${headerColor}')" class="remark-option-btn" data-value="${opt}" style="min-height: 45px; border: 1px solid #e0e0e0; background-color: #fff; color: #333; border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5px; transition: all 0.2s;">
                    <span style="font-size: 14px;">${mainText}</span>
                    ${subText ? `<span style="font-size: 11px; color: #999;">${subText}</span>` : ""}
                  </button>
                `;
                })
                .join("")}
            </div>
          </div>
        `;
    })
    .join("");
}

export function toggleRemark(btn: HTMLElement, activeColor: string) {
  btn.classList.toggle("selected");
  const isSelected = btn.classList.contains("selected");

  if (isSelected) {
    btn.style.borderColor = activeColor;
    btn.style.backgroundColor = `${activeColor}15`;
    btn.style.color = activeColor;
    const sub = btn.querySelector("span:last-child") as HTMLElement;
    if (sub && sub !== btn.querySelector("span:first-child"))
      sub.style.color = activeColor;
    const main = btn.querySelector("span:first-child") as HTMLElement;
    if (main) main.style.fontWeight = "bold";
  } else {
    btn.style.borderColor = "#e0e0e0";
    btn.style.backgroundColor = "#fff";
    btn.style.color = "#333";
    const sub = btn.querySelector("span:last-child") as HTMLElement;
    if (sub && sub !== btn.querySelector("span:first-child"))
      sub.style.color = "#999";
    const main = btn.querySelector("span:first-child") as HTMLElement;
    if (main) main.style.fontWeight = "normal";
  }
}

export function closeRemarksModal() {
  const modal = document.getElementById("remarks-modal");
  if (modal) modal.style.display = "none";
  currentRemarkOrderId = null; // 重置
}

export async function saveRemarks() {
  const customInput = document.getElementById(
    "custom-remarks",
  ) as HTMLInputElement;
  const custom = customInput?.value.trim();
  const activeBtns = document.querySelectorAll(".remark-option-btn.selected");

  let remarks: string[] = [];
  activeBtns.forEach((btn) => {
    const val = btn.getAttribute("data-value");
    if (val) remarks.push(val);
  });
  if (custom) remarks.push(custom);

  if (remarks.length === 0) return alert("请输入或选择备注");

  // 构建请求体
  const payload: any = { remarks: remarks };
  if (currentRemarkOrderId) {
    payload.orderId = currentRemarkOrderId;
  } else {
    payload.tableNumber = currentTableNum;
  }

  try {
    const res = await fetch("/api/admin/orders/remarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      alert("备注已保存");
      closeRemarksModal();
      if (window.refreshOrderList) window.refreshOrderList(); // 刷新列表以显示新备注
    } else {
      alert("保存失败: " + data.error);
    }
  } catch (e) {
    alert("网络错误");
  }
}

// ================== 3. 详情/修改逻辑 ==================

export function handleModify(tableNum: string) {
  currentTableNum = tableNum;
  const orders = getOrdersForTable(tableNum);

  if (orders.length === 0) {
    alert("该桌号没有活跃订单");
    return;
  }

  // 如果只有一个订单，直接打开编辑弹窗 (使用 index.astro 中定义的 handleEditOrder)
  if (orders.length === 1) {
    if (window.handleEditOrder) {
      window.handleEditOrder(orders[0].element);
    } else {
      alert("编辑功能未加载，请刷新页面");
    }
    return;
  }

  // 如果有多个订单，显示列表供选择
  showDetailsModal(tableNum, orders);
}

function showDetailsModal(tableNum: string, orders: any[]) {
  const modal = document.getElementById("details-modal");
  if (!modal) return;

  const numEl = document.getElementById("details-table-num");
  if (numEl) numEl.textContent = `(桌号 ${tableNum})`;

  const listEl = document.getElementById("details-order-list");
  if (listEl) {
    listEl.innerHTML = orders
      .map((order) => {
        const itemsHtml = order.items
          .map(
            (i: any) => `
                <div style="display:flex; justify-content:space-between; align-items: flex-start; font-size:13px; color:#666; margin-bottom:4px; border-bottom: 1px dashed #eee; padding-bottom: 2px;">
                    <div style="display:flex; flex-direction:column;">
                        <span style="font-weight:bold; color:#333;">${i.name}</span>
                        <span style="font-size:12px; color:#888;">${i.subName || ""}</span>
                    </div>
                    <div style="text-align:right;">
                        <div>x${i.quantity}</div>
                        <div>${i.price}</div>
                    </div>
                </div>
            `,
          )
          .join("");

        return `
            <div class="order-card-detail" style="padding:15px; border:1px solid #eee; border-radius:8px; margin-bottom:10px; background:#f9f9f9;">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px; border-bottom:1px solid #ddd; padding-bottom:5px;">
                    <span style="font-weight:bold;">订单 #${order.order_no}</span>
                    <span style="color:#999;">${order.time}</span>
                </div>
                <div style="margin-bottom:10px;">
                    ${itemsHtml}
                </div>
                <div style="text-align:right; font-weight:bold; color:#d32f2f;">
                    ${order.amount} RSD
                </div>
                
                <div style="text-align:right; margin-top:10px;">
                    <button onclick="window.triggerEditOrder('${order.id}')" style="padding:5px 10px; background:#fff; border:1px solid #ddd; border-radius:4px; cursor:pointer;">✏️ 修改订单</button>
                </div>
            </div>
        `;
      })
      .join("");
  }

  modal.style.display = "flex";
}

export function triggerEditOrder(orderId: string) {
  // 找到对应的 DOM 元素
  const el = document.querySelector<HTMLElement>(
    `.hidden-data[data-oid="${orderId}"]`,
  );
  if (window.handleEditOrder && el) {
    closeDetailsModal();
    window.handleEditOrder(el);
  } else {
    alert("无法调用订单修改功能，请刷新页面重试");
  }
}

export function closeDetailsModal() {
  const modal = document.getElementById("details-modal");
  if (modal) modal.style.display = "none";
}

// ================== 4. 其他 ==================

export function handleTableOrder(tableNum: string) {
  // Get shop param from URL (supports both ID and Slug)
  const shopParam = window.location.pathname.split("/")[2];

  const orderUrl = `/${shopParam}?table=${encodeURIComponent(tableNum)}&embed=1&isAdmin=true&_t=${Date.now()}`;

  const modal = document.getElementById("order-modal");
  if (modal) {
    const numEl = document.getElementById("order-table-num");
    if (numEl) numEl.textContent = tableNum;

    const loadingEl = document.getElementById("order-loading");
    if (loadingEl) loadingEl.style.display = "block";

    modal.style.display = "flex";
    modal.classList.add("active");

    const iframe = document.getElementById("order-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = orderUrl;
      iframe.onload = () => {
        if (loadingEl) loadingEl.style.display = "none";
      };
    }
  } else {
    // Fallback to new tab if modal is missing
    window.open(orderUrl, "_blank");
  }
}

export function closeOrderModal() {
  const modal = document.getElementById("order-modal");
  if (modal) {
    modal.style.display = "none";
    modal.classList.remove("active");
    const iframe = document.getElementById("order-iframe") as HTMLIFrameElement;
    if (iframe) iframe.src = "about:blank";
  }
}

export async function handlePrintTable(tableNum: string) {
  const orders = getOrdersForTable(tableNum);

  if (orders.length === 0) {
    alert("No active orders found for this table");
    return;
  }

  try {
    const btn = document.querySelector(
      `.table-card-wide[data-table="${tableNum}"] .btn-print`,
    ) as HTMLButtonElement;
    const originalText = btn ? btn.innerText : "";
    if (btn) {
      btn.innerText = "Sending...";
      btn.disabled = true;
    }

    const res = await fetch("/api/admin/reprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableNum,
        shopSlug: window.shopSlug,
      }),
    });

    const data = await res.json();

    if (data.success) {
      if ((window as any).showToast) {
        (window as any).showToast(`Print command sent: table ${tableNum}`);
      } else {
        alert("Print command sent");
      }
    } else {
      alert("Print failed: " + (data.error || "unknown error"));
    }

    if (btn) {
      btn.innerText = originalText;
      btn.disabled = false;
    }
  } catch (e) {
    console.error("Print error:", e);
    alert("Network error: cannot reach server");
    const btn = document.querySelector(
      `.table-card-wide[data-table="${tableNum}"] .btn-print`,
    ) as HTMLButtonElement;
    if (btn) {
      btn.innerText = "Print";
      btn.disabled = false;
    }
  }
}
// Add Dish Review Logic
export async function approveTableReviews(tableNum: string) {
  if (!confirm(`确定同意桌号 ${tableNum} 的加菜请求吗？`)) return;

  try {
    const res = await fetch(
      `/api/admin/tables/${encodeURIComponent(tableNum)}/reviews/approve`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: window.shopId,
      }),
      },
    );

    const data = await res.json();
    if (data.success) {
      alert("✅ 已同意加菜");
      refreshAdminOrdersView();
    } else {
      alert("操作失败: " + data.error);
    }
  } catch (e) {
    alert("网络错误");
  }
}

export async function rejectTableReviews(tableNum: string) {
  if (!confirm(`确定拒绝桌号 ${tableNum} 的加菜请求吗？`)) return;

  try {
    const res = await fetch(
      `/api/admin/tables/${encodeURIComponent(tableNum)}/reviews/reject`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantId: window.shopId,
      }),
      },
    );

    const data = await res.json();
    if (data.success) {
      alert("已拒绝请求");
      refreshAdminOrdersView();
    } else {
      alert("操作失败: " + data.error);
    }
  } catch (e) {
    alert("网络错误");
  }
}

// ================== Reject Order Logic ==================

export function openRejectModal(orderId: string) {
  const modal = document.getElementById("reject-modal");
  const inputId = document.getElementById(
    "reject-order-id",
  ) as HTMLInputElement;
  const reasonInput = document.getElementById(
    "reject-reason-input",
  ) as HTMLTextAreaElement;

  if (modal && inputId && reasonInput) {
    inputId.value = orderId;
    reasonInput.value = "";
    // 清除选中状态
    document
      .querySelectorAll(".reject-reason-btn")
      .forEach((btn) => btn.classList.remove("selected"));
    modal.style.display = "flex";
  }
}

export function closeRejectModal() {
  const modal = document.getElementById("reject-modal");
  if (modal) modal.style.display = "none";
}

// 暴露给 window 以便 HTML onclick 调用 (需要手动绑定或在 window 对象上扩展)
(window as any).selectRejectReason = function (reason: string) {
  const input = document.getElementById(
    "reject-reason-input",
  ) as HTMLTextAreaElement;
  if (input) input.value = reason;

  // 更新按钮样式
  document.querySelectorAll(".reject-reason-btn").forEach((btn) => {
    if ((btn as HTMLElement).innerText.includes(reason.split(" /")[0])) {
      btn.classList.add("selected");
    } else {
      btn.classList.remove("selected");
    }
  });
};

export async function confirmReject() {
  const inputId = document.getElementById(
    "reject-order-id",
  ) as HTMLInputElement;
  const reasonInput = document.getElementById(
    "reject-reason-input",
  ) as HTMLTextAreaElement;

  const orderId = inputId.value;
  const reason = reasonInput.value.trim();

  if (!reason) return alert("请选择或输入拒绝原因");

  if (!confirm("确定要拒绝该订单吗？此操作无法撤销。")) return;

  try {
    const res = await fetch(
      `/api/admin/orders/${encodeURIComponent(orderId)}/reject`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: reason,
        restaurantId: window.shopId,
      }),
      },
    );

    const data = await res.json();
    if (data.success) {
      if ((window as any).showToast) (window as any).showToast("🚫 订单已拒绝");
      closeRejectModal();
      refreshAdminOrdersView();
    } else {
      alert("操作失败: " + data.error);
    }
  } catch (e) {
    alert("网络错误");
  }
}

// Expose to window for inline calls
if (typeof window !== "undefined") {
  const registry = ((window as any).__adminHandlers ||= {});

  window.handleTableCheckout = handleTableCheckout;
  window.updateCheckoutTotal = updateCheckoutTotal;
  window.closeCheckoutModal = closeCheckoutModal;
  window.confirmCheckout = confirmCheckout;
  window.handleTableRemarks = handleTableRemarks;
  window.toggleRemark = toggleRemark;
  window.closeRemarksModal = closeRemarksModal;
  window.saveRemarks = saveRemarks;
  window.handleModify = handleModify;
  window.closeDetailsModal = closeDetailsModal;
  window.triggerEditOrder = triggerEditOrder;
  window.handleTableOrder = handleTableOrder;
  window.closeOrderModal = closeOrderModal;
  window.handlePrintTable = handlePrintTable;

  window.approveTableReviews = approveTableReviews;
  window.rejectTableReviews = rejectTableReviews;

  // 新增
  (window as any).openRejectModal = openRejectModal;
  (window as any).closeRejectModal = closeRejectModal;
  (window as any).confirmReject = confirmReject;

  Object.assign(registry, {
    handleTableCheckout,
    updateCheckoutTotal,
    closeCheckoutModal,
    confirmCheckout,
    handleTableRemarks,
    toggleRemark,
    closeRemarksModal,
    saveRemarks,
    handleModify,
    closeDetailsModal,
    triggerEditOrder,
    handleTableOrder,
    closeOrderModal,
    handlePrintTable,
    approveTableReviews,
    rejectTableReviews,
    openRejectModal,
    closeRejectModal,
    confirmReject,
  });

  window.dispatchEvent(new CustomEvent("admin:handlers-registered"));
}
