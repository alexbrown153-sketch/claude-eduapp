// Daily mystery chest (Roadmap #91). The first session finished each day
// opens a chest. It rewards turning up every day, which matters most in the
// last week before the exam.
//
// The odds are fixed and generous, and the chest never teases: there's no
// "so close!", no spinning reel, no near-miss display. You're shown what you
// won, and that's it.
//   - 1 in 5: a shop item that can only come from the chest (while any are
//     still unowned);
//   - otherwise: 20–100 bonus points, in steps of 10, each amount equally
//     likely.

import { SHOP_ITEMS } from './shop.js';

export const CHEST_ITEM_CHANCE = 0.2;
const POINT_AMOUNTS = [20, 30, 40, 50, 60, 70, 80, 90, 100];

// The child's own calendar day (not UTC), so the chest resets at their
// midnight rather than at 1am in summer time.
export function localDateStr(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function isChestAvailable(meta, today = localDateStr()) {
  return meta.lastChestDate !== today;
}

// Picks the reward. `rng` is injectable so the odds can be checked by hand.
// Returns { type: 'points', points } or { type: 'item', itemId }.
export function rollChest(ownedItemIds, rng = Math.random) {
  const unownedChestItems = SHOP_ITEMS.filter((i) => i.chestOnly && !ownedItemIds.includes(i.id));
  if (unownedChestItems.length > 0 && rng() < CHEST_ITEM_CHANCE) {
    const item = unownedChestItems[Math.floor(rng() * unownedChestItems.length)];
    return { type: 'item', itemId: item.id };
  }
  const points = POINT_AMOUNTS[Math.floor(rng() * POINT_AMOUNTS.length)];
  return { type: 'points', points };
}
