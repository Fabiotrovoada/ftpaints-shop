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
  // Bespoke colour spec for FT Custom Mixed Paints (customer-entered).
  // One entry per unit — qty equals colours.length for custom-mixed lines.
  // Vehicle make/model/year lets the team match the exact factory shade.
  colours?: Array<{ name?: string; code?: string; make?: string; model?: string; year?: string }>;
  // Legacy single-colour fields — kept for baskets already persisted in
  // localStorage before the per-unit change. New adds use `colours`.
  colourName?: string;
  colourCode?: string;
}

interface BasketStore {
  items: BasketItem[];
  itemCount: number;
  addItem: (item: BasketItem) => void;
  removeItem: (id: number) => void;
  updateQty: (id: number, qty: number) => void;
  setColours: (id: number, colours: Array<{ name?: string; code?: string; make?: string; model?: string; year?: string }>) => void;
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
        // Custom-mixed lines carry a per-unit colour list: merge by concatenating
        // the colours (so a second add doesn't discard its spec) and keep qty in
        // step with the colour count. Non-colour lines just sum quantities.
        const merge = (i: BasketItem): BasketItem => {
          if (item.colours) {
            const colours = [...(i.colours ?? []), ...item.colours];
            return { ...i, colours, qty: colours.length };
          }
          return { ...i, qty: i.qty + item.qty };
        };
        const newItems = existing
          ? state.items.map(i => i.id === item.id ? merge(i) : i)
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
      // Replace a custom-mixed line's per-unit colour list; qty follows the count.
      setColours: (id, colours) => set(state => {
        const newItems = state.items.map(i =>
          i.id === id ? { ...i, colours, qty: colours.length } : i);
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
