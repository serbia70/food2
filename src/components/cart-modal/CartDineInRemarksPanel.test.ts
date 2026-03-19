import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function runDineInPanelClassProbe() {
  const script = String.raw`
    import { h, Fragment } from 'preact';
    import { pathToFileURL } from 'node:url';
    import { resolve } from 'node:path';

    globalThis.React = { createElement: h, Fragment };

    const componentUrl = pathToFileURL(resolve(process.cwd(), 'src/components/cart-modal/CartDineInRemarksPanel.tsx')).href;
    const { default: CartDineInRemarksPanel } = await import(componentUrl);

    function collectClassNames(node, out) {
      if (!node || typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
        return out;
      }
      if (Array.isArray(node)) {
        for (const child of node) collectClassNames(child, out);
        return out;
      }

      if (typeof node.props?.className === 'string') {
        out.add(node.props.className);
      }

      const children = node.props?.children;
      if (Array.isArray(children)) {
        for (const child of children) collectClassNames(child, out);
      } else {
        collectClassNames(children, out);
      }

      return out;
    }

    const vnode = CartDineInRemarksPanel({
      showRemarksPanel: true,
      dineInRemarks: ['免辣/No Spicy'],
      dineInCustomRemark: '少盐',
      remarkCategories: [
        { name: '辣度/Spiciness', options: ['免辣/No Spicy'] },
      ],
      onTogglePanel() {},
      onToggleRemark() {},
      onCustomRemarkChange() {},
    });

    const classNames = [...collectClassNames(vnode, new Set())];
    process.stdout.write(JSON.stringify(classNames));
  `;

  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('dine-in remark panel uses the delivery-style outer classes', () => {
  const classNames = runDineInPanelClassProbe();

  assert.ok(classNames.includes('delivery-remarks-section'));
  assert.ok(classNames.includes('remarks-toggle'));
  assert.ok(classNames.includes('remark-ui'));
  assert.ok(!classNames.includes('cart-remarks-section'));
  assert.ok(!classNames.includes('cart-remarks-toggle'));
});
