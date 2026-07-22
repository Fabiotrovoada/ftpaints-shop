'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Products a user has dismissed from their Buy Again list. Buy Again is derived
// from order history (which we can't delete), so "remove" is a client-side
// dismissal persisted per browser — same storage pattern as lib/favourites.ts.
interface HiddenBuyAgainStore {
  ids: Set<number>;
  hide: (id: number) => void;
  unhide: (id: number) => void;
  isHidden: (id: number) => boolean;
}

export const useHiddenBuyAgain = create<HiddenBuyAgainStore>()(
  persist(
    (set, get) => ({
      ids: new Set<number>(),
      hide: (id) => set(state => {
        const ids = new Set(state.ids);
        ids.add(id);
        return { ids };
      }),
      unhide: (id) => set(state => {
        const ids = new Set(state.ids);
        ids.delete(id);
        return { ids };
      }),
      isHidden: (id) => get().ids.has(id),
    }),
    {
      name: 'ftpaints-buyagain-hidden',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const data = JSON.parse(str);
          data.state.ids = new Set(data.state.ids);
          return data;
        },
        setItem: (name, value) => {
          const data = { ...value, state: { ...value.state, ids: Array.from(value.state.ids) } };
          localStorage.setItem(name, JSON.stringify(data));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);
