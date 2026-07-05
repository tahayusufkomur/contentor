import type { CartItem } from "@/types/billing";

const CART_KEY = "contentor_cart";

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function addToCart(item: CartItem): void {
  if (typeof window === "undefined") return;
  const cart = getCart();
  const exists = cart.some(
    (c) =>
      c.content_type === item.content_type && c.object_id === item.object_id,
  );
  if (!exists) {
    cart.push(item);
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }
}

export function removeFromCart(content_type: string, object_id: number): void {
  if (typeof window === "undefined") return;
  const cart = getCart().filter(
    (c) => !(c.content_type === content_type && c.object_id === object_id),
  );
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

export function clearCart(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CART_KEY);
}

export function getCartCount(): number {
  return getCart().length;
}
