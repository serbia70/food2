import test from 'node:test';
import assert from 'node:assert/strict';

import { localizeImagesBatch } from './admin-localize-images.ts';

test('localizeImagesBatch: updateProductImage receives product fields (prevents wiping name/price)', async () => {
  const products = [
    {
      id: 1,
      category_id: 9,
      name: 'N1',
      sub_name: 'S1',
      price: 123,
      img: 'https://example.com/a.webp',
    },
  ];

  const updates: any[] = [];

  const result = await localizeImagesBatch({
    products,
    cursor: 0,
    batchSize: 10,
    canFetchImage: async () => true,
    uploadImageFromUrl: async () => ({ url: 'https://api.example.com/uploads/1.webp' }),
    updateProductImage: async (product, newUrl) => {
      updates.push({ product, newUrl });
      return true;
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.stats.localized, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].newUrl, 'https://api.example.com/uploads/1.webp');
  assert.deepEqual(
    updates[0].product,
    {
      id: 1,
      category_id: 9,
      name: 'N1',
      sub_name: 'S1',
      price: 123,
      img: 'https://example.com/a.webp',
    },
    'update should receive original product fields so caller can send a full upsert payload',
  );
});
