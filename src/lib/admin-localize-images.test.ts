import test from 'node:test';
import assert from 'node:assert/strict';

import { localizeImagesBatch } from './admin-localize-images.ts';

test('localizeImagesBatch: uploads remote images and returns updates', async () => {
  const products = [
    { id: 1, img: 'https://example.com/a.webp' },
    { id: 2, img: '/uploads/already.webp' },
    { id: 3, img: 'https://example.com/b.jpg' },
  ];

  const uploads: Array<{ productId: number; url: string }> = [];

  const result = await localizeImagesBatch({
    products,
    cursor: 0,
    batchSize: 10,
    canFetchImage: async (url) => !String(url).includes('already.webp'),
    uploadImageFromUrl: async (productId, url, filenameHint) => {
      uploads.push({ productId, url: String(url) + '|' + String(filenameHint) });
      return { url: `https://api.example.com/uploads/${productId}.webp` };
    },
    updateProductImage: async (product, newUrl) => {
      assert.ok(newUrl.includes(`/uploads/${product.id}.webp`));
      return true;
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.done, true);
  assert.equal(result.stats.localized, 2);
  assert.equal(result.stats.skipped, 1);
  assert.equal(result.failures.length, 0);

  assert.deepEqual(uploads, [
    { productId: 1, url: 'https://example.com/a.webp|a.webp' },
    { productId: 3, url: 'https://example.com/b.jpg|b.jpg' },
  ]);
});

test('localizeImagesBatch: reports failures when upload fails', async () => {
  const products = [{ id: 1, img: 'https://example.com/a.webp' }];

  const result = await localizeImagesBatch({
    products,
    cursor: 0,
    batchSize: 10,
    canFetchImage: async () => true,
    uploadImageFromUrl: async () => {
      throw new Error('download failed');
    },
    updateProductImage: async () => true,
  });

  assert.equal(result.success, true);
  assert.equal(result.stats.failed, 1);
  assert.equal(result.failures.length, 1);
  assert.ok(String(result.failures[0]?.error || '').includes('download failed'));
});
