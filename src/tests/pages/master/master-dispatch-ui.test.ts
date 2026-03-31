import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const pagePath = resolve(process.cwd(), 'src/pages/master/index.astro');

test('master page source wires dispatch tab into dashboard layout', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /const MASTER_DISPATCH_PROXY_PATH = '\/api\/master\/dispatch';/);
  assert.match(page, /let masterDispatch: MasterDispatchPayload = \{ awaiting: \[\], delivering: \[\], pools: \[\] \};/);
  assert.match(page, /href="\/master\?tab=dispatch"/);
  assert.match(page, /data-master-panel="dispatch"/);
  assert.match(page, /masterDispatch\.awaiting\.length/);
  assert.match(page, /masterDispatch\.delivering\.length/);
  assert.match(page, /masterDispatch\.pools\.length/);
  assert.match(page, /待接单/);
  assert.match(page, /配送中/);
  assert.match(page, /骑手池/);
  assert.match(page, /当前无待接单订单/);
  assert.match(page, /当前无配送中订单/);
  assert.match(page, /当前未拿到骑手池统计/);
  assert.match(page, /import \{ loadMasterDispatchData \} from '\.\.\/\.\.\/lib\/master-dispatch-loader';/);
  assert.match(page, /const dispatchData = await loadMasterDispatchData\(/);
  assert.match(page, /masterDispatch = dispatchData\.payload;/);
  assert.match(page, /dispatchLoadError = dispatchData\.error;/);
  assert.doesNotMatch(page, /async function loadDispatchPoolFallback/);
  assert.doesNotMatch(page, /\$\{API_BASE_URL\}\/api\/master\/impersonate-shop\?id=/);
  assert.doesNotMatch(page, /\/api\/admin\/riders`/);
  assert.doesNotMatch(page, /masterDispatch\.pools\.length === 0/);
  assert.match(page, /data-master-dispatch-action="impersonate"/);
  assert.match(page, /data-master-dispatch-action="remind"/);
  assert.match(page, /data-master-dispatch-action="assign"/);
  assert.match(page, /data-master-dispatch-shop-id=/);
  assert.match(page, /data-master-dispatch-order-id=/);
  assert.match(page, /处理调度/);
  assert.match(page, /指派骑手/);
  assert.match(page, /import \{ initMasterDispatchActions \} from '\.\.\/\.\.\/scripts\/master\/dispatch-actions';/);
  assert.match(page, /const dispatchActionBindings = initMasterDispatchActions\(/);
  assert.match(page, /dispatchActionBindings\.handleDocumentClick\(event\);/);
  assert.doesNotMatch(page, /async function ensureMasterDispatchShopContext/);
  assert.doesNotMatch(page, /async function masterDispatchRepublish/);
  assert.doesNotMatch(page, /async function masterDispatchAssignRider/);
  assert.doesNotMatch(page, /const target = event\.target instanceof Element \? event\.target\.closest\('\[data-master-dispatch-action\]'\) : null;/);
  assert.doesNotMatch(page, /fetch\('\/api\/master\/impersonate-shop'/);
  assert.doesNotMatch(page, /fetch\('\/api\/admin\/rider-dispatch'/);
  assert.match(page, /再次催单/);
});

test('master page source wires riders tab into dashboard layout', async () => {
  const page = await readFile(pagePath, 'utf8');

  assert.match(page, /href="\/master\?tab=riders"/);
  assert.match(page, /data-master-panel="riders"/);
  assert.match(page, /MasterRiderStatusPanel/);
  assert.match(page, /const MASTER_RIDERS_PROXY_PATH = '\/api\/master\/riders';/);
  assert.match(page, /initMasterRiderStatusActions\(document\)/);
  assert.doesNotMatch(page, /代收订单[\s\S]{0,400}代收总额[\s\S]{0,400}配送费总额/);
});
