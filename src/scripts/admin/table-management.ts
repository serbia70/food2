import { matchesTableRef, parseTableRef, inferLegacySimpleHallNumber } from '../../lib/admin-table-ref';
import { getRemarkCategoryTheme } from '../../lib/remark-ui-theme';
import { getAdminHandler, getAdminRuntimeState, registerAdminGlobal, showAdminToast } from './globals';

// 全局变量
let currentTableNum: string | null = null;
let currentTableOrders: any[] = [];
let currentRemarkOrderId: string | null = null;

function refreshAdminOrdersView() {
  const refreshFromRegistry =
    window.__adminHandlers?.refreshOrderList || null;
  const refreshFromWindow = window.refreshOrderList || null;
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

function setElementStyles(el: HTMLElement, styles: Record<string, string>) {
  Object.entries(styles).forEach(([key, value]) => {
    (el.style as any)[key] = value;
  });
}

function createTextElement<K extends keyof HTMLElementTagNameMap>(tag: K, text: string, styles?: Record<string, string>) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (styles) setElementStyles(el, styles);
  return el;
}

function createOrderItemDetailNode(item: any) {
  const row = document.createElement('div');
  setElementStyles(row, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    fontSize: '13px',
    color: '#666',
    marginBottom: '4px',
    borderBottom: '1px dashed #eee',
    paddingBottom: '2px',
  });

  const left = document.createElement('div');
  setElementStyles(left, {
    display: 'flex',
    flexDirection: 'column',
  });
  left.appendChild(createTextElement('span', String(item?.name || ''), {
    fontWeight: 'bold',
    color: '#333',
  }));
  left.appendChild(createTextElement('span', String(item?.subName || ''), {
    fontSize: '12px',
    color: '#888',
  }));

  const right = document.createElement('div');
  right.style.textAlign = 'right';
  right.append(
    createTextElement('div', `x${item?.quantity ?? ''}`),
    createTextElement('div', String(item?.price || '')),
  );

  row.append(left, right);
  return row;
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
  const seen = new Set<string>();

  allOrders.forEach((el) => {
    const oidRaw = String(el.dataset.oid || el.dataset.orderId || '').trim();
    if (oidRaw) {
      if (seen.has(oidRaw)) return;
      seen.add(oidRaw);
    }
    const status = el.dataset.status || "pending";
    // 忽略已完成或已取消的订单
    if (
      status === "completed" ||
      status === "cancelled" ||
      status === "archived"
    )
      return;

    const tableInfo = el.dataset.table || "";
    if (matchesTableRef(targetRef, tableInfo, maxConfiguredTable)) {
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
    const rows = orders.map((order) => {
      const row = document.createElement('div');
      setElementStyles(row, {
        display: 'flex',
        alignItems: 'center',
        padding: '10px',
        borderBottom: '1px solid #eee',
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'checkout-checkbox';
      checkbox.value = String(order.id);
      checkbox.checked = true;
      checkbox.addEventListener('change', () => updateCheckoutTotal());
      setElementStyles(checkbox, {
        width: '20px',
        height: '20px',
        marginRight: '10px',
        cursor: 'pointer',
      });

      const content = document.createElement('div');
      content.style.flex = '1';
      const title = document.createElement('div');
      title.style.fontWeight = 'bold';
      title.append(document.createTextNode(String(order.time || '')));
      const orderNo = createTextElement('span', ` (#${order.order_no})`, {
        fontWeight: 'normal',
        color: '#666',
      });
      title.appendChild(orderNo);

      const itemsDetail = order.items
        .filter((i: any) => i != null)
        .map((i: any) => `${i.name} ${i.sub_name ? '(' + i.sub_name + ')' : ''} x${i.quantity}`)
        .join(', ');
      const detail = createTextElement('div', itemsDetail, {
        fontSize: '12px',
        color: '#555',
      });
      content.append(title, detail);

      const amount = createTextElement('div', `${order.amount} RSD`, {
        fontWeight: 'bold',
        color: '#d32f2f',
      });

      row.append(checkbox, content, amount);
      return row;
    });
    listEl.replaceChildren(...rows);
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
  if (checkboxes.length === 0) return showAdminToast("请至少选择一个订单");

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
      showAdminToast(`结账成功：${orderIds.length} 单，${data.totalAmount} RSD`);
      closeCheckoutModal();
      refreshAdminOrdersView();
      const loadOrderStats = getAdminHandler<() => void>('loadOrderStats');
      if (typeof loadOrderStats === 'function') loadOrderStats();
    } else {
      showAdminToast("结账失败: " + data.error);
    }
  } catch (error: any) {
    showAdminToast("网络错误: " + error.message);
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

  const categories = remarkCategories.map((cat) => {
    const theme = getRemarkCategoryTheme(cat.name);

    const category = document.createElement('div');
    category.className = 'remark-category';
    category.style.setProperty('--remark-accent', theme.accent);
    category.style.setProperty('--remark-accent-soft', theme.soft);

    const title = document.createElement('div');
    title.className = 'category-title';

    const icon = document.createElement('span');
    icon.className = 'category-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = theme.icon;

    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = cat.name;

    title.append(icon, name);

    const grid = document.createElement('div');
    grid.className = 'remark-options-grid';

    cat.options.forEach((opt) => {
      const [mainText, subText] = String(opt).split('/');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'remark-option-btn';
      button.dataset.value = String(opt);
      button.addEventListener('click', () => toggleRemark(button));

      const main = document.createElement('span');
      main.className = 'option-main';
      main.textContent = mainText || '';
      button.appendChild(main);

      if (subText) {
        const sub = document.createElement('span');
        sub.className = 'option-sub';
        sub.textContent = subText;
        button.appendChild(sub);
      }

      grid.appendChild(button);
    });

    category.append(title, grid);
    return category;
  });

  container.replaceChildren(...categories);
}

export function toggleRemark(btn: HTMLElement) {
  btn.classList.toggle("selected");
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
      const refreshOrderList = getAdminHandler<() => void>('refreshOrderList');
      if (typeof refreshOrderList === 'function') refreshOrderList();
    } else {
      alert("保存失败: " + data.error);
    }
  } catch (e) {
    alert("网络错误");
  }
}

// ================== 3. 详情/修改逻辑 ==================

export function handleTableDetails(tableNum: string) {
  currentTableNum = tableNum;
  const orders = getOrdersForTable(tableNum);

  if (orders.length === 0) {
    showAdminToast('该桌号没有活跃订单');
    return;
  }

  showDetailsModal(tableNum, orders);
}

export function handleModify(tableNum: string) {
  currentTableNum = tableNum;
  const orders = getOrdersForTable(tableNum);

  if (orders.length === 0) {
    alert("该桌号没有活跃订单");
    return;
  }

  // 直接打开最新一单的编辑弹窗（多单也不再进入中间列表）
  const latest = [...orders].sort((a, b) => Number(b.id || 0) - Number(a.id || 0))[0];
  if (!latest) {
    alert("该桌号没有可修改订单");
    return;
  }
  const handleEditOrder = getAdminHandler<(el: any) => void>('handleEditOrder');
  if (typeof handleEditOrder === 'function') {
    handleEditOrder(latest.element);
  } else {
    alert("编辑功能未加载，请刷新页面");
  }
}

function showDetailsModal(tableNum: string, orders: any[]) {
  const modal = document.getElementById("details-modal");
  if (!modal) return;

  const numEl = document.getElementById("details-table-num");
  if (numEl) numEl.textContent = `(桌号 ${tableNum})`;

  const listEl = document.getElementById("details-order-list");
  if (listEl) {
    const cards = orders.map((order) => {
      const card = document.createElement('div');
      card.className = 'order-card-detail';
      setElementStyles(card, {
        padding: '15px',
        border: '1px solid #eee',
        borderRadius: '8px',
        marginBottom: '10px',
        background: '#f9f9f9',
      });

      const header = document.createElement('div');
      setElementStyles(header, {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '10px',
        borderBottom: '1px solid #ddd',
        paddingBottom: '5px',
      });
      header.append(
        createTextElement('span', `订单 #${order.order_no}`, { fontWeight: 'bold' }),
        createTextElement('span', String(order.time || ''), { color: '#999' }),
      );

      const itemsWrap = document.createElement('div');
      itemsWrap.style.marginBottom = '10px';
      (Array.isArray(order.items) ? order.items : []).forEach((item: any) => {
        itemsWrap.appendChild(createOrderItemDetailNode(item));
      });

      const remarks = Array.isArray(order.remarks) ? order.remarks.filter(Boolean) : [];
      const remarksSection = remarks.length
        ? (() => {
            const wrap = document.createElement('div');
            setElementStyles(wrap, {
              marginTop: '10px',
              marginBottom: '10px',
              padding: '10px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: '6px',
            });
            wrap.append(
              createTextElement('div', '备注', {
                fontWeight: 'bold',
                color: '#9a3412',
                marginBottom: '6px',
              }),
              createTextElement('div', remarks.join('，'), {
                fontSize: '13px',
                color: '#7c2d12',
              }),
            );
            return wrap;
          })()
        : null;

      const amount = createTextElement('div', `${order.amount} RSD`, {
        textAlign: 'right',
        fontWeight: 'bold',
        color: '#d32f2f',
      });

      const actions = document.createElement('div');
      setElementStyles(actions, {
        textAlign: 'right',
        marginTop: '10px',
      });
      const editButton = createTextElement('button', '✏️ 修改订单', {
        padding: '5px 10px',
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: '4px',
        cursor: 'pointer',
      }) as HTMLButtonElement;
      editButton.type = 'button';
      editButton.addEventListener('click', () => triggerEditOrder(String(order.id)));
      actions.appendChild(editButton);

      if (remarksSection) card.appendChild(remarksSection);
      card.append(header, itemsWrap, amount, actions);
      return card;
    });
    listEl.replaceChildren(...cards);
  }

  modal.style.display = "flex";
}

export function triggerEditOrder(orderId: string) {
  // 找到对应的 DOM 元素
  const el = document.querySelector<HTMLElement>(
    `.hidden-data[data-oid="${orderId}"]`,
  );
  const handleEditOrder = getAdminHandler<(el: any) => void>('handleEditOrder');
  if (typeof handleEditOrder === 'function' && el) {
    closeDetailsModal();
    handleEditOrder(el);
  } else {
    alert("无法调用订单修改功能，请刷新页面重试");
  }
}

// Ensure handleEditOrder is available by the time user clicks "修改订单"
try {
  if (typeof window !== 'undefined') {
    window.addEventListener('admin:order-edit-ready', () => {});
  }
} catch {}

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
        shopSlug: getAdminRuntimeState().shopSlug,
      }),
    });

    const data = await res.json().catch(() => ({} as any));

    if (data && data.success) {
      const msg = String(data.message || '').trim() || `打印指令已发送: 桌号 ${tableNum}`;
      showAdminToast(msg);
    } else {
      alert("打印失败: " + ((data && data.error) || "unknown error"));
    }

    if (btn) {
      btn.innerText = originalText;
      btn.disabled = false;
    }
  } catch (e) {
    console.error("Print error:", e);
    alert("网络错误，无法连接服务器");
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
        restaurantId: getAdminRuntimeState().shopId,
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
        restaurantId: getAdminRuntimeState().shopId,
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
registerAdminGlobal('selectRejectReason', function (reason: string) {
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
});

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
        restaurantId: getAdminRuntimeState().shopId,
      }),
      },
    );

    const data = await res.json();
    if (data.success) {
      showAdminToast("🚫 订单已拒绝");
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
  registerAdminGlobal('handleTableCheckout', handleTableCheckout);
  registerAdminGlobal('updateCheckoutTotal', updateCheckoutTotal);
  registerAdminGlobal('closeCheckoutModal', closeCheckoutModal);
  registerAdminGlobal('confirmCheckout', confirmCheckout);
  registerAdminGlobal('handleTableRemarks', handleTableRemarks);
  registerAdminGlobal('toggleRemark', toggleRemark);
  registerAdminGlobal('closeRemarksModal', closeRemarksModal);
  registerAdminGlobal('saveRemarks', saveRemarks);
  registerAdminGlobal('handleTableDetails', handleTableDetails);
  registerAdminGlobal('handleModify', handleModify);
  registerAdminGlobal('closeDetailsModal', closeDetailsModal);
  registerAdminGlobal('triggerEditOrder', triggerEditOrder);
  registerAdminGlobal('handleTableOrder', handleTableOrder);
  registerAdminGlobal('closeOrderModal', closeOrderModal);
  registerAdminGlobal('handlePrintTable', handlePrintTable);

  registerAdminGlobal('approveTableReviews', approveTableReviews);
  registerAdminGlobal('rejectTableReviews', rejectTableReviews);

  registerAdminGlobal('openRejectModal', openRejectModal);
  registerAdminGlobal('closeRejectModal', closeRejectModal);
  registerAdminGlobal('confirmReject', confirmReject);

  window.dispatchEvent(new CustomEvent("admin:handlers-registered"));
}
