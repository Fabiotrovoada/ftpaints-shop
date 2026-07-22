'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface BasketItem {
  id: number;
  name: string;
  code: string;
  price: number;
  qty: number;
  image?: string;
  qtyAvailable?: number;
  // Bespoke colour spec for FT Custom Mixed Paints (customer-entered)
  colourName?: string;
  colourCode?: string;
}

interface BasketStore {
  items: BasketItem[];
  itemCount: number;
  addItem: (item: BasketItem) => void;
  removeItem: (id: number) => void;
  updateQty: (id: number, qty: number) => void;
  clearBasket: () => void;
  total: number;
}

export const useBasket = create<BasketStore>()(
  persist(
    (set) => ({
      items: [],
      itemCount: 0,
      total: 0,
      addItem: (item) => set(state => {
        const existing = state.items.find(i => i.id === item.id);
        const newItems = existing
          ? state.items.map(i => i.id === item.id ? { ...i, qty: i.qty + item.qty } : i)
          : [...state.items, item];
        return {
          items: newItems,
          itemCount: newItems.reduce((s, i) => s + i.qty, 0),
          total: newItems.reduce((s, i) => s + i.price * i.qty, 0),
        };
      }),
      removeItem: (id) => set(state => {
        const newItems = state.items.filter(i => i.id !== id);
        return {
          items: newItems,
          itemCount: newItems.reduce((s, i) => s + i.qty, 0),
          total: newItems.reduce((s, i) => s + i.price * i.qty, 0),
        };
      }),
      updateQty: (id, qty) => set(state => {
        const newItems = qty <= 0
          ? state.items.filter(i => i.id !== id)
          : state.items.map(i => i.id === id ? { ...i, qty } : i);
        return {
          items: newItems,
          itemCount: newItems.reduce((s, i) => s + i.qty, 0),
          total: newItems.reduce((s, i) => s + i.price * i.qty, 0),
        };
      }),
      clearBasket: () => set({ items: [], itemCount: 0, total: 0 }),
    }),
    {
      name: 'ftpaints-basket',
      // Recompute derived values on hydration from localStorage
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.itemCount = state.items.reduce((s, i) => s + i.qty, 0);
          state.total = state.items.reduce((s, i) => s + i.price * i.qty, 0);
        }
      },
    }
  )
);
