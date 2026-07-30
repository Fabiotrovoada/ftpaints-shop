'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Products the user has opened, newest first. Stored per browser (like the
// basket and favourites) — Odoo holds no per-user browsing state. Only ids and
// timestamps are kept: prices are per-partner and must come fresh from the API.
export const MAX_RECENTLY_VIEWED = 24;

export interface RecentlyViewedEntry {
  id: number;
  /** ISO timestamp of the most recent view */
  viewedAt: string;
}

interface RecentlyViewedStore {
  items: RecentlyViewedEntry[];
  record: (id: number) => void;
  remove: (id: number) => void;
  clear: () => void;
}

export const useRecentlyViewed = create<RecentlyViewedStore>()(
  persist(
    (set) => ({
      items: [],
      // Re-viewing a product moves it back to the front and refreshes its
      // timestamp rather than adding a duplicate, so the cap counts 24 distinct
      // products. Anything past the cap falls off the end.
      record: (id) => set(state => ({
        items: [
          { id, viewedAt: new Date().toISOString() },
          ...state.items.filter(i => i.id !== id),
        ].slice(0, MAX_RECENTLY_VIEWED),
      })),
      remove: (id) => set(state => ({ items: state.items.filter(i => i.id !== id) })),
      clear: () => set({ items: [] }),
    }),
    {
      // A plain array serialises as-is, so unlike lib/favourites.ts this needs
      // no custom Set↔Array storage adapter.
      name: 'ftpaints-recently-viewed',
    }
  )
);
