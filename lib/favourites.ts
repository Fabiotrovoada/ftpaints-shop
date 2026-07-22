'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FavouritesStore {
  ids: Set<number>;
  toggle: (id: number) => void;
  isFavourite: (id: number) => boolean;
}

export const useFavourites = create<FavouritesStore>()(
  persist(
    (set, get) => ({
      ids: new Set<number>(),
      toggle: (id) => set(state => {
        const ids = new Set(state.ids);
        ids.has(id) ? ids.delete(id) : ids.add(id);
        return { ids };
      }),
      isFavourite: (id) => get().ids.has(id),
    }),
    {
      name: 'ftpaints-favourites',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str || str === 'null') return null;
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
