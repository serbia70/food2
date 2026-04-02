import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from '../../../../node_modules/.pnpm/@astrojs+compiler@2.13.1/node_modules/@astrojs/compiler/dist/node/index.js';

const panelPath = resolve(process.cwd(), 'src/components/master/MasterRiderStatusPanel.astro');
const cardPath = resolve(process.cwd(), 'src/components/master/MasterRiderStatusCard.astro');
const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');

type AstroNode = {
  type?: string;
  name?: string;
  attributes?: Array<{ name?: string; kind?: string; value?: string }>;
  children?: AstroNode[];
};

async function parseAstro(filePath: string) {
  const source = await readFile(filePath, 'utf8');
  const result = await parse(source, { filename: filePath });
  return { source, ast: result.ast as AstroNode };
}

function walk(node: AstroNode, visit: (node: AstroNode) => void) {
  visit(node);
  for (const child of node.children || []) {
    walk(child, visit);
  }
}

function collectElements(node: AstroNode, name: string): AstroNode[] {
  const matches: AstroNode[] = [];
  walk(node, (current) => {
    if ((current.type === 'element' || current.type === 'component') && current.name === name) {
      matches.push(current);
    }
  });
  return matches;
}

function hasAttribute(node: AstroNode, name: string, value?: string) {
  return (node.attributes || []).some((attribute) => attribute.name === name && (value === undefined || attribute.value === value));
}

test('master rider status panel source exposes stable summary/group contracts', async () => {
  const { source, ast } = await parseAstro(panelPath);

  assert.match(source, /const SUMMARY_ITEMS = \[/);
  assert.match(source, /const RIDER_GROUPS = \[/);
  assert.match(source, /label: '平台骑手总人数'/);
  assert.match(source, /label: '空闲人数'/);
  assert.match(source, /label: '送餐中人数'/);
  assert.match(source, /label: '下班人数'/);
  assert.match(source, /label: '进行中订单'/);
  assert.match(source, /label: '代收订单'/);
  assert.match(source, /label: '配送费总额'/);
  assert.match(source, /label: '代收总额'/);

  const sections = collectElements(ast, 'section');
  assert.ok(sections.some((node) => hasAttribute(node, 'data-master-riders-panel')));
  assert.ok(sections.some((node) => hasAttribute(node, 'data-master-rider-group')));

  const summaryItems = collectElements(ast, 'div').filter((node) => hasAttribute(node, 'data-master-rider-summary-item'));
  assert.equal(summaryItems.length, 1);

  const groupList = collectElements(ast, 'div').find((node) => hasAttribute(node, 'data-master-rider-group-list'));
  const emptyState = collectElements(ast, 'div').find((node) => hasAttribute(node, 'data-master-rider-group-empty'));
  assert.ok(groupList);
  assert.ok(emptyState);

  const cardComponents = collectElements(ast, 'MasterRiderStatusCard');
  assert.equal(cardComponents.length, 1);
  assert.ok(hasAttribute(cardComponents[0], 'rider'));
  assert.ok(hasAttribute(cardComponents[0], 'groupKey'));
  assert.ok(hasAttribute(cardComponents[0], 'groupLabel'));
});

test('master rider status card source exposes no-js expandable contract', async () => {
  const { source, ast } = await parseAstro(cardPath);

  assert.match(source, /const BADGE_ITEMS = \[/);
  assert.match(source, /const ORDER_METRIC_ITEMS = \[/);
  assert.match(source, /const ordersId = `master-rider-orders-/);
  assert.match(source, /代收/);
  assert.match(source, /非代收/);
  assert.doesNotMatch(source, /data-master-rider-orders hidden/);
  assert.doesNotMatch(source, /aria-expanded="false"/);

  const article = collectElements(ast, 'article')[0];
  assert.ok(article);
  assert.ok(hasAttribute(article, 'data-master-rider-card'));
  assert.ok(hasAttribute(article, 'data-master-rider-id'));
  assert.ok(hasAttribute(article, 'data-master-rider-group'));
  assert.ok(hasAttribute(article, 'data-master-rider-group-label'));

  const details = collectElements(ast, 'details')[0];
  assert.ok(details);
  assert.ok(hasAttribute(details, 'data-master-rider-details'));
  assert.ok(hasAttribute(details, 'open'));

  const summary = collectElements(ast, 'summary')[0];
  assert.ok(summary);
  assert.ok(hasAttribute(summary, 'data-master-rider-toggle'));
  assert.ok(hasAttribute(summary, 'aria-controls'));
  assert.ok(hasAttribute(summary, 'aria-expanded', 'true'));

  const orders = collectElements(ast, 'div').find((node) => hasAttribute(node, 'data-master-rider-orders'));
  assert.ok(orders);
  assert.ok(hasAttribute(orders!, 'id'));
  assert.ok(hasAttribute(orders!, 'data-master-rider-default-open', '1'));

  const orderRow = collectElements(ast, 'div').find((node) => hasAttribute(node, 'data-master-rider-order-row'));
  const orderEmpty = collectElements(ast, 'div').find((node) => hasAttribute(node, 'data-master-rider-order-empty'));
  const orderLegend = collectElements(ast, 'div').find((node) => hasAttribute(node, 'data-master-rider-order-legend'));
  assert.ok(orderRow);
  assert.ok(orderEmpty);
  assert.ok(orderLegend);

  const badges = collectElements(ast, 'span').filter((node) => hasAttribute(node, 'data-master-rider-badge'));
  assert.equal(badges.length, 1);
});

test('master riders tab no longer depends on missing /api/master/riders upstream', async () => {
  const page = await readFile(pagePath, 'utf8');
  const loader = await readFile(resolve(process.cwd(), 'src/lib/master-rider-status-loader.ts'), 'utf8');

  assert.doesNotMatch(page, /const MASTER_RIDERS_PROXY_PATH = '\/api\/master\/riders';/);
  assert.doesNotMatch(page, /new URL\(MASTER_RIDERS_PROXY_PATH, Astro\.url\)/);
  assert.doesNotMatch(page, /骑手状态加载失败/);
  assert.match(loader, /const ridersProxyUrl = new URL\('\/api\/admin\/riders', requestUrl\);/);
  assert.doesNotMatch(loader, /\$\{API_BASE_URL\}\/api\/admin\/riders/);
});
