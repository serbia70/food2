import { useStore } from '@nanostores/preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  cartItems,
  addToCart,
  removeOne,
  getSpecialPriceDisplay,
  getActiveSpecialPromotionProducts,
  getSpendDiscountBannerCopy,
  type SpecialPromotion,
  type SpendDiscountPromotion,
} from '../store/cartStore';
import type { Category, Product } from '../types';

interface MenuListProps {
  categories: Category[];
  specialPromotionMap?: Record<string, SpecialPromotion>;
  spendDiscountPromotion?: SpendDiscountPromotion | null;
  footerPhone?: string;
  footerCopyright?: string;
  footerText?: string;
  menuLayout?: string; // image-2col, image-1col, text-2col, text-1col
  onActiveCategoryChange?: (categoryId: string | undefined) => void;
}

export default function MenuList({
  categories,
  specialPromotionMap = {},
  spendDiscountPromotion = null,
  footerPhone,
  footerCopyright,
  footerText,
  menuLayout = 'image-2col',
  onActiveCategoryChange,
}: MenuListProps) {
  const $cart = useStore(cartItems);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  const isTextMode = menuLayout.startsWith('text');
  const isOneCol = menuLayout.endsWith('1col');
  const stickyOffsetTop = 56;
  const categoryScrollOffset = stickyOffsetTop;
  const imageBoxSize = isOneCol ? 84 : 72;
  const allProducts = categories.flatMap((category) => category.products) as Product[];
  const activeSpecialPromotionProducts = getActiveSpecialPromotionProducts(allProducts, specialPromotionMap);
  const spendDiscountBannerCopy = getSpendDiscountBannerCopy(spendDiscountPromotion);
  const spendDiscountParts = spendDiscountBannerCopy?.match(/^满\s*(\d+)\s*减\s*(\d+)\s*RSD$/);
  const productById = new Map(allProducts.map((product) => [String(product.id), product] as const));
  const specialPromotionMenuProducts: Product[] = activeSpecialPromotionProducts.map((product) => {
    const source = productById.get(product.productId);
    return {
      id: product.productId,
      name: source?.name ?? product.productName,
      sub_name: source?.sub_name ?? product.productSubName,
      price: source?.price ?? product.originalPrice,
      img: source?.img,
      stock: source?.stock,
    };
  });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const categoryIds = useMemo(() => categories.map((category) => String(category.id)), [categories]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const updateActiveCategory = () => {
      const sectionAnchorTop = container.scrollTop + categoryScrollOffset;
      let nextActiveCategoryId: string | undefined = categoryIds[0];

      for (const categoryId of categoryIds) {
        const el = container.querySelector<HTMLElement>(`[id="${categoryId}"]`);
        if (!el) continue;
        if (el.offsetTop <= sectionAnchorTop) {
          nextActiveCategoryId = categoryId;
        } else {
          break;
        }
      }

      onActiveCategoryChange?.(nextActiveCategoryId);
    };

    updateActiveCategory();
    container.addEventListener('scroll', updateActiveCategory, { passive: true });
    return () => container.removeEventListener('scroll', updateActiveCategory);
  }, [categoryIds, onActiveCategoryChange, categoryScrollOffset]);

  const renderMenuProductCard = (p: Product) => {
    const qty = $cart[p.id]?.quantity || 0;
    const { displayPrice, originalPrice, isSpecialPrice } = getSpecialPriceDisplay(p, specialPromotionMap);
    const hasImg = !!p.img && p.img !== '/favicon.svg' && !p.img.includes('dummyimage');

    const itemStyle = isTextMode ? {
      background: '#fff',
      borderRadius: '10px',
      display: 'flex',
      flexDirection: 'row' as const,
      padding: isOneCol ? '10px 12px' : '8px 10px',
      minHeight: '60px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      border: '1px solid #f0f4f8',
      position: 'relative' as const,
      alignItems: 'center',
      overflow: 'hidden'
    } : {
      background: '#fff',
      borderRadius: '10px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'row' as const,
      padding: '6px',
      minHeight: '95px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
      border: '1px solid #f0f4f8',
      position: 'relative' as const
    };

    return (
      <div key={p.id} id={`menu-product-${String(p.id)}`} style={itemStyle}>
        {hasImg && !isTextMode && (
          <div
            style={{
              width: `${imageBoxSize}px`,
              height: `${imageBoxSize}px`,
              marginRight: '8px',
              flexShrink: 0,
              borderRadius: '8px',
              overflow: 'hidden',
              background: '#edf2f7',
            }}
          >
            <img
              src={p.img}
              alt={p.name}
              onClick={() => p.img && setPreviewImg(p.img)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        )}

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: isTextMode ? 'center' : 'space-between', minWidth: 0, paddingLeft: '4px' }}>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: isTextMode ? '15px' : '13px', fontWeight: '700', color: '#1a202c', lineHeight: '1.2', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
            <div style={{ fontSize: '11px', color: '#a0aec0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.subName || p.sub_name}</div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: isTextMode ? '4px' : 'auto', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: 0, flexWrap: 'wrap' }}>
              <div style={{ color: '#e53e3e', fontWeight: '800', fontSize: isTextMode ? (isOneCol ? '16px' : '14px') : '14px', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayPrice} <small style={{fontSize:'9px', fontWeight:'normal', opacity:0.7}}>RSD</small>
              </div>
              {isSpecialPrice && (
                <div style={{ fontSize: '11px', color: '#a0aec0', textDecoration: 'line-through', whiteSpace: 'nowrap', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {originalPrice} RSD
                </div>
              )}
            </div>

            <div style={{ flexShrink: 0, marginLeft: '4px' }}>
              {p.stock === 0 ? (
                <span style={{ fontSize: '10px', color: '#cbd5e0' }}>售罄</span>
              ) : qty === 0 ? (
                <button type="button" onClick={() => addToCart(p)} style={{ width: isTextMode ? (isOneCol ? '28px' : '24px') : '24px', height: isTextMode ? (isOneCol ? '28px' : '24px') : '24px', borderRadius: '50%', background: '#ff4b33', color: '#fff', border: 'none', fontSize: isTextMode ? (isOneCol ? '20px' : '18px') : '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', background:'#f7fafc', borderRadius:'12px', padding:'2px', border: '1px solid #edf2f7' }}>
                  <button type="button" onClick={() => removeOne(p.id)} style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', color: '#4a5568', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>-</button>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '14px', textAlign: 'center' }}>{qty}</span>
                  <button type="button" onClick={() => addToCart(p)} style={{ width: '20px', height: '20px', borderRadius: '50%', border: 'none', background: '#ff4b33', color: '#fff', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={scrollContainerRef}
      className="app-content"
      id="scrollContainer"
      style={{
        paddingTop: '8px',
        paddingRight: '8px',
        paddingLeft: '8px',
        paddingBottom: 'calc(160px + env(safe-area-inset-bottom, 0px))',
        background: '#f7fafc',
        minHeight: '100vh',
      }}
    >
      {spendDiscountBannerCopy && spendDiscountParts && (
        <div style={{ marginBottom: '14px', padding: '10px 12px', background: '#fffaf0', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '15px', fontWeight: '800', color: '#111827' }}>满减活动</span>
          <span style={{ fontSize: '15px', color: '#111827' }}>满</span>
          <span style={{ fontSize: '15px', fontWeight: '800', color: '#dc2626' }}>{spendDiscountParts?.[1]}</span>
          <span style={{ fontSize: '15px', color: '#111827' }}>减</span>
          <span style={{ fontSize: '15px', fontWeight: '800', color: '#dc2626' }}>{spendDiscountParts?.[2]}</span>
          <span style={{ fontSize: '15px', color: '#111827' }}>RSD</span>
        </div>
      )}

      {activeSpecialPromotionProducts.length > 0 && (
        <div className="menu-section" style={{ marginBottom: '20px' }}>
          {/* 今日特价分类 */}
          <div className="section-header" style={{
              fontSize: '16px',
              fontWeight: '800',
              marginBottom: '12px',
              padding: '10px 12px',
              background: '#fff',
              borderRadius: '8px',
              color: '#2d3748',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
              position: 'static',
              top: 'auto',
              zIndex: 'auto',
              borderBottom: 'none'
          }}>
            今日特价
          </div>
          <div className={`menu-grid-adaptive ${isOneCol ? 'layout-1col' : 'layout-2col'}`}>
            {specialPromotionMenuProducts.map((product) => renderMenuProductCard(product))}
          </div>
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat.id} id={String(cat.id)} className="menu-section" style={{ marginBottom: '20px', scrollMarginTop: `${categoryScrollOffset}px` }}>
          <div className="section-header" style={{
              fontSize: '16px',
              fontWeight: '800',
              marginBottom: '12px',
              padding: '10px 12px',
              background: '#fff',
              borderRadius: '8px',
              color: '#2d3748',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
              display: 'flex',
              alignItems: 'baseline',
              gap: '6px',
              position: 'static',
              top: 'auto',
              zIndex: 'auto',
              borderBottom: 'none'
          }}>
            {cat.name}
            {cat.subName && <span style={{ fontWeight: 'normal', color: '#a0aec0', fontSize: '13px' }}>{cat.subName}</span>}
          </div>
          
          <div className={`menu-grid-adaptive ${isOneCol ? 'layout-1col' : 'layout-2col'}`}>
            {cat.products.map((p) => renderMenuProductCard(p))}
          </div>
        </div>
      ))}

      <div
        style={{
          textAlign: 'center',
          padding: '28px 20px 20px',
          color: '#a0aec0',
          display: 'grid',
          gap: '8px',
          justifyItems: 'center',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: '700', color: '#4a5568', maxWidth: '100%', lineHeight: '1.6', wordBreak: 'break-word' }}>
          {footerText || '订餐热线'}
        </div>
        <a
          href={`tel:${footerPhone}`}
          style={{
            color: '#ff4b33',
            textDecoration: 'none',
            fontSize: '16px',
            fontWeight: '800',
            maxWidth: '100%',
            wordBreak: 'break-all',
          }}
        >
          {footerPhone}
        </a>
        <div style={{ fontSize: '11px', maxWidth: '100%', lineHeight: '1.5', wordBreak: 'break-word' }}>{footerCopyright}</div>
      </div>

      {previewImg && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPreviewImg(null)}>
          <img src={previewImg} style={{ maxWidth: '95%', maxHeight: '95%', objectFit: 'contain' }} />
        </div>
      )}
    </div>
  );
}
