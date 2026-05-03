import { shouldLocalizeImageUrl } from '../scripts/admin/localize-images-utils.ts';
import { guessFilenameFromUrl } from '../scripts/admin/localize-images-utils.ts';

export type LocalizeProduct = {
  id: number;
  img: string;
};

export type LocalizeFailure = {
  id: number;
  img: string;
  error: string;
};

export async function localizeImagesBatch(options: {
  products: Array<Record<string, any>>;
  cursor: number;
  batchSize: number;

  canFetchImage: (url: string) => Promise<boolean>;
  uploadImageFromUrl: (productId: number, url: string, filenameHint: string) => Promise<{ url: string }>;
  updateProductImage: (product: Record<string, any>, newUrl: string) => Promise<boolean>;
}): Promise<{
  success: true;
  cursor: number;
  done: boolean;
  stats: { checked: number; localized: number; skipped: number; failed: number };
  failures: LocalizeFailure[];
}> {
  const { products, cursor, batchSize } = options;

  const slice = products.slice(cursor, cursor + batchSize);
  const failures: LocalizeFailure[] = [];

  let localized = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of slice) {
    const img = String(p?.img || '').trim();
    if (!img) {
      skipped++;
      continue;
    }

    // Only localize remote URLs; local paths are skipped (but can be checked elsewhere).
    if (!shouldLocalizeImageUrl(img)) {
      skipped++;
      continue;
    }

    try {
      const reachable = await options.canFetchImage(img);
      if (!reachable) {
        throw new Error('source image not reachable');
      }

      const filenameHint = guessFilenameFromUrl(img);
      const productId = Number(p?.id || 0) || 0;
      if (!productId) throw new Error('invalid product id');

      const uploaded = await options.uploadImageFromUrl(productId, img, filenameHint);
      const newUrl = String(uploaded?.url || '').trim();
      if (!newUrl) throw new Error('upload returned empty url');

      const ok = await options.updateProductImage(p, newUrl);
      if (!ok) throw new Error('update product failed');

      localized++;
    } catch (e: any) {
      failed++;
      failures.push({
        id: p.id,
        img,
        error: e?.message || String(e || 'failed'),
      });
    }
  }

  const newCursor = cursor + slice.length;

  return {
    success: true,
    cursor: newCursor,
    done: newCursor >= products.length,
    stats: {
      checked: slice.length,
      localized,
      skipped,
      failed,
    },
    failures,
  };
}
