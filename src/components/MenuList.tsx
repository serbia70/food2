import { useStore } from '@nanostores/preact';
import { useState } from 'preact/hooks';
import { cartItems, addToCart, removeOne } from '../store/cartStore';
import type { Category } from '../types';

interface MenuListProps {
  categories: Category[];
  footerPhone?: string;
  footerCopyright?: string;
  footerText?: string;
}

export default function MenuList({
  categories,
  footerPhone,
  footerCopyright,
  footerText,
}: MenuListProps) {
  const $cart = useStore(cartItems);
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  return (
    <div className="app-content" id="scrollContainer">
      {categories.map((cat) => (
        <div key={cat.id} id={String(cat.id)} className="menu-section">
          <div className="section-header">
            {cat.name}{' '}
            {cat.subName && (
              <span style={{ fontWeight: 'normal', color: '#666' }}> / {cat.subName}</span>
            )}
          </div>
          <div className="product-grid">
            {cat.products.map((p) => {
              const qty = $cart[p.id]?.quantity || 0;
              return (
                <div key={p.id} className="product-item">
                  <div className="prod-img-box">
                    <img
                      src={p.img || 'https://dummyimage.com/100'}
                      alt={p.name}
                      loading="lazy"
                      onClick={() => setPreviewImg(p.img || 'https://dummyimage.com/100')}
                      style={{ cursor: 'zoom-in' }}
                    />
                  </div>
                  <div className="prod-info">
                    <span className="prod-title">{p.name}</span>
                    <span className="prod-sub">{p.sub_name}</span>
                    <span className="prod-price">{p.price} RSD</span>
                  </div>

                  <div className="btn-wrapper">
                    {p.stock === 0 ? (
                      <div
                        style={{
                          color: '#999',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        }}
                      >
                        售罄 / Sold Out
                      </div>
                    ) : qty === 0 ? (
                      <button
                        type="button"
                        className="circle-plus"
                        onClick={() => addToCart(p)}
                      >
                        +
                      </button>
                    ) : (
                      <div className="qty-ctrl">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => removeOne(p.id)}
                        >
                          -
                        </button>
                        <span className="qty-num">{qty}</span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => addToCart(p)}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className="my-footer" style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#333',
            marginBottom: '5px',
          }}
        >
          {footerText || '订餐热线'}:{' '}
          <a
            href={`tel:${footerPhone}`}
            style={{ color: '#ff4b33', textDecoration: 'none' }}
          >
            {footerPhone}
          </a>
        </div>
        <div style={{ fontSize: '12px', color: '#999' }}>{footerCopyright}</div>
      </div>

      {previewImg && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            animation: 'fadeIn 0.2s ease-out',
          }}
          onClick={() => setPreviewImg(null)}
        >
          <img
            src={previewImg}
            style={{
              maxWidth: '90%',
              maxHeight: '90%',
              objectFit: 'contain',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          />
        </div>
      )}

      <style>{`
        /* No ranking styles */
      `}</style>
    </div>
  );
}
