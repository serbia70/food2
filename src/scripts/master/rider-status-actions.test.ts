import test from 'node:test';
import assert from 'node:assert/strict';

import { initMasterRiderStatusActions } from './rider-status-actions.ts';

type Listener = (event: { target?: unknown }) => void;

class FakeSummary {
  attrs = new Map<string, string>();

  constructor(initialExpanded: 'true' | 'false') {
    this.attrs.set('aria-expanded', initialExpanded);
  }

  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
}

class FakeDetails {
  open: boolean;
  summary: FakeSummary;

  constructor(open: boolean, summary: FakeSummary) {
    this.open = open;
    this.summary = summary;
  }

  closest(selector: string) {
    return selector === '[data-master-rider-details]' ? this : null;
  }

  querySelector(selector: string) {
    return selector === '[data-master-rider-toggle]' ? this.summary : null;
  }
}

class FakeRoot {
  listeners = new Map<string, Listener>();

  addEventListener(type: string, listener: Listener) {
    this.listeners.set(type, listener);
  }

  dispatch(type: string, event: { target?: unknown }) {
    const listener = this.listeners.get(type);
    if (listener) listener(event);
  }
}

test('initMasterRiderStatusActions syncs summary aria-expanded on details toggle', () => {
  const root = new FakeRoot();
  const summary = new FakeSummary('true');
  const details = new FakeDetails(false, summary);

  initMasterRiderStatusActions(root as any);
  root.dispatch('toggle', { target: details });

  assert.equal(summary.getAttribute('aria-expanded'), 'false');
});

test('initMasterRiderStatusActions ignores toggle targets outside rider details', () => {
  const root = new FakeRoot();
  const summary = new FakeSummary('true');

  initMasterRiderStatusActions(root as any);
  root.dispatch('toggle', {
    target: {
      closest: () => null,
      querySelector: () => summary,
    },
  });

  assert.equal(summary.getAttribute('aria-expanded'), 'true');
});
