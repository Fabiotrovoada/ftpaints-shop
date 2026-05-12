'use client';
import React, { createContext, useContext, useState, useCallback } from 'react';

export interface CartItem {
  product_id: number;
  variant_id?: number;
  name: string;
  default_code: string;
  price: number;
  qty: number;
  qty_available: number;
  virtual_available: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateQty: (product_id: number, qty: number) => void;
  removeItem: (product_id: number) => void;
  clearCart: () => void;
  total: number;
  count: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      const existing = prev.find(i => i.product_id === item.product_id);
      if (existing) {
        return prev.map(i => i.product_id === item.product_id
          ? { ...i, qty: i.qty + item.qty }
          : i
        );
      }
      return [...prev, item];
    });
  }, []);

  const updateQty = useCallback((product_id: number, qty: number) => {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.product_id !== product_id));
    } else {
      setItems(prev => prev.map(i => i.product_id === product_id ? { ...i, qty } : i));
    }
  }, []);

  const removeItem = useCallback((product_id: number) => {
    setItems(prev => prev.filter(i => i.product_id !== product_id));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, addItem, updateQty, removeItem, clearCart, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be inside CartProvider');
  return ctx;
}
