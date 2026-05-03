type RiderToggleTarget = {
  closest?: (selector: string) => unknown;
};

type RiderDetailsNode = {
  open?: boolean;
  querySelector?: (selector: string) => unknown;
};

type RiderSummaryNode = {
  setAttribute?: (name: string, value: string) => void;
};

function isToggleTarget(target: EventTarget | null): target is RiderToggleTarget {
  return Boolean(target && typeof target === 'object' && 'closest' in target);
}

function isDetailsNode(node: unknown): node is RiderDetailsNode {
  return Boolean(node && typeof node === 'object' && 'querySelector' in node && 'open' in node);
}

function isSummaryNode(node: unknown): node is RiderSummaryNode {
  return Boolean(node && typeof node === 'object' && 'setAttribute' in node);
}

export function initMasterRiderStatusActions(root: ParentNode = document) {
  root.addEventListener('toggle', (event) => {
    if (!isToggleTarget(event.target)) return;

    const details = event.target.closest('[data-master-rider-details]');
    if (!isDetailsNode(details)) return;

    const summary = details.querySelector?.('[data-master-rider-toggle]');
    if (!isSummaryNode(summary)) return;

    summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
  });
}
