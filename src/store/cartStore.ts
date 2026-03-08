import { map, computed } from 'nanostores';
import type { Product } from '../types';

export type { Product };

export interface CartItem extends Product {
  quantity: number;
}

export type CartStore = Record<string | number, CartItem>;

// Store: { [productId]: { ...product, quantity: 1 } }
export const cartItems = map<CartStore>({});

export function addToCart(product: Product) {
  const current = cartItems.get();
  const existing = current[product.id];
  if (existing) {
    cartItems.setKey(product.id, { ...existing, quantity: existing.quantity + 1 });
  } else {
    cartItems.setKey(product.id, { ...product, quantity: 1 });
  }
}

export function removeOne(productId: string | number) {
  const current = cartItems.get();
  const existing = current[productId];
  if (!existing) return;

  if (existing.quantity > 1) {
    cartItems.setKey(productId, { ...existing, quantity: existing.quantity - 1 });
  } else {
    const newCart = { ...current };
    delete newCart[productId];
    cartItems.set(newCart);
  }
}

// clear cart
export function clearCart() {
  cartItems.set({});
}

export const cartTotal = computed(cartItems, (items) => {
  let total = 0;
  let count = 0;
  Object.values(items).forEach((item) => {
    total += item.price * item.quantity;
    count += item.quantity;
  });
  return { price: total, count };
});

