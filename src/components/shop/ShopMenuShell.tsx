import { useState } from 'preact/hooks';
import MenuList from '../MenuList';
import Sidebar from '../Sidebar';
import type { Category } from '../../types';
import type { SpecialPromotion, SpendDiscountPromotion } from '../../store/cartStore';

interface ShopMenuShellProps {
  categories: Category[];
  specialPromotionMap?: Record<string, SpecialPromotion>;
  spendDiscountPromotion?: SpendDiscountPromotion | null;
  footerPhone?: string;
  footerCopyright?: string;
  footerText?: string;
  menuLayout?: string;
}

export default function ShopMenuShell({
  categories,
  specialPromotionMap,
  spendDiscountPromotion,
  footerPhone,
  footerCopyright,
  footerText,
  menuLayout,
}: ShopMenuShellProps) {
  const categoryScrollOffset = 64;
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(categories[0]?.id ? `${categories[0]?.id}` : undefined);

  return (
    <>
      <Sidebar categories={categories} activeId={activeCategoryId} stickyOffsetTop={categoryScrollOffset} />
      <MenuList
        categories={categories}
        specialPromotionMap={specialPromotionMap}
        spendDiscountPromotion={spendDiscountPromotion}
        footerPhone={footerPhone}
        footerCopyright={footerCopyright}
        footerText={footerText}
        menuLayout={menuLayout}
        onActiveCategoryChange={setActiveCategoryId}
      />
    </>
  );
}
