type InitMasterShopTableActionsOptions = {
  canLoadProtectedMasterActions: boolean;
};

const MASTER_SEARCH_FILTER_SELECTOR = '[data-master-filter-search]';
const MASTER_SELECT_FILTER_SELECTORS = '[data-master-filter-status], [data-master-filter-billing], [data-master-sort]';
const MASTER_PROTECTED_SUBMIT_SELECTOR = '[onsubmit*="window.submitMaster"] button[type="submit"]';

export function initMasterShopTableActions({
  canLoadProtectedMasterActions,
}: InitMasterShopTableActionsOptions) {
  function applyMasterTableFilters() {
    const searchInput = document.querySelector('[data-master-filter-search]');
    const statusSelect = document.querySelector('[data-master-filter-status]');
    const billingSelect = document.querySelector('[data-master-filter-billing]');
    const sortSelect = document.querySelector('[data-master-sort]');
    const rows = Array.from(document.querySelectorAll('[data-master-shop-row]'));
    const tbody = document.querySelector('.shop-table tbody');

    if (!(tbody instanceof HTMLElement)) return;

    const search = searchInput instanceof HTMLInputElement ? searchInput.value.trim().toLowerCase() : '';
    const status = statusSelect instanceof HTMLSelectElement ? statusSelect.value : 'all';
    const billing = billingSelect instanceof HTMLSelectElement ? billingSelect.value : 'all';
    const sort = sortSelect instanceof HTMLSelectElement ? sortSelect.value : 'revenue_desc';

    const filtered = rows.filter((row) => {
      if (!(row instanceof HTMLElement)) return false;
      const name = row.dataset.name || '';
      const slug = row.dataset.slug || '';
      const rowStatus = row.dataset.status || '';
      const rowBilling = row.dataset.billing || '';

      if (search && !name.includes(search) && !slug.includes(search)) return false;
      if (status !== 'all' && rowStatus !== status) return false;
      if (billing !== 'all' && rowBilling !== billing) return false;
      return true;
    });

    filtered.sort((a, b) => {
      const getNum = (el: Element, key: string) => Number(el instanceof HTMLElement ? el.dataset[key] || 0 : 0);
      if (sort === 'orders_desc') return getNum(b, 'orders') - getNum(a, 'orders');
      if (sort === 'balance_desc') return getNum(b, 'balance') - getNum(a, 'balance');
      if (sort === 'billing_desc') return getNum(b, 'billingSeverity') - getNum(a, 'billingSeverity');
      return getNum(b, 'revenue') - getNum(a, 'revenue');
    });

    const visibleRows = new Set(filtered);
    rows.forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      row.hidden = !visibleRows.has(row);
    });

    filtered.forEach((row) => {
      tbody.appendChild(row);
    });
  }

  function bindMasterTableFilters() {
    document.querySelectorAll(MASTER_SEARCH_FILTER_SELECTOR).forEach((el) => {
      if (el instanceof HTMLElement && el.dataset.masterFilterBound === '1') return;
      el.addEventListener('input', applyMasterTableFilters);
      if (el instanceof HTMLElement) el.dataset.masterFilterBound = '1';
    });

    document.querySelectorAll(MASTER_SELECT_FILTER_SELECTORS).forEach((el) => {
      if (el instanceof HTMLElement && el.dataset.masterFilterBound === '1') return;
      el.addEventListener('change', applyMasterTableFilters);
      if (el instanceof HTMLElement) el.dataset.masterFilterBound = '1';
    });
  }

  function openMasterStorefront(path: unknown) {
    const nextPath = String(path || '').trim();
    if (!nextPath) return;
    window.open(nextPath, '_blank', 'noopener,noreferrer');
  }

  function handleDomContentLoaded() {
    if (!canLoadProtectedMasterActions) {
      document.querySelectorAll(MASTER_PROTECTED_SUBMIT_SELECTOR).forEach((el) => {
        if (el instanceof HTMLButtonElement) {
          el.disabled = true;
        }
      });
    }
    applyMasterTableFilters();
    bindMasterTableFilters();
  }

  return {
    applyMasterTableFilters,
    bindMasterTableFilters,
    openMasterStorefront,
    handleDomContentLoaded,
  };
}
