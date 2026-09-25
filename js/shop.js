// Cosmetic points-shop catalog (SPEC.md §8 gamification, kept lightweight per
// CLAUDE.md — spending affects only cosmetics, never question content or
// difficulty). Each item's `id`'s prefix is its category. Cost-0 items are
// each category's default and are always considered owned. `chestOnly`
// items have no cost at all: they come only from the daily mystery chest.

export const SHOP_ITEMS = [
  // Themes — override CSS custom properties via [data-theme] on <body>.
  { id: 'theme-default', category: 'theme', label: 'Classic Blue', cost: 0, swatch: '#4c5fd5' },
  { id: 'theme-sunset', category: 'theme', label: 'Sunset Orange', cost: 150, swatch: '#e8734a' },
  { id: 'theme-forest', category: 'theme', label: 'Forest Green', cost: 150, swatch: '#2f9e64' },
  { id: 'theme-berry', category: 'theme', label: 'Berry Purple', cost: 200, swatch: '#9748c9' },

  // Fonts — override font-family via [data-font] on <body>.
  { id: 'font-default', category: 'font', label: 'Classic', cost: 0 },
  { id: 'font-rounded', category: 'font', label: 'Bubbly', cost: 100 },
  { id: 'font-mono', category: 'font', label: 'Robot Mode', cost: 100 },

  // Avatars — shown in the header and on the summary screen. A mix of
  // animals and more "character" (humanoid/fantasy) options, per SPEC's
  // character-based avatar upgrade.
  { id: 'avatar-default', category: 'avatar', label: 'Smile', cost: 0, emoji: '🙂' },
  { id: 'avatar-cat', category: 'avatar', label: 'Cat', cost: 60, emoji: '🐱' },
  { id: 'avatar-dog', category: 'avatar', label: 'Dog', cost: 60, emoji: '🐶' },
  { id: 'avatar-frog', category: 'avatar', label: 'Frog', cost: 60, emoji: '🐸' },
  { id: 'avatar-fox', category: 'avatar', label: 'Fox', cost: 80, emoji: '🦊' },
  { id: 'avatar-panda', category: 'avatar', label: 'Panda', cost: 80, emoji: '🐼' },
  { id: 'avatar-star', category: 'avatar', label: 'Star', cost: 80, emoji: '🌟' },
  { id: 'avatar-octopus', category: 'avatar', label: 'Octopus', cost: 90, emoji: '🐙' },
  { id: 'avatar-lion', category: 'avatar', label: 'Lion', cost: 100, emoji: '🦁' },
  { id: 'avatar-ninja', category: 'avatar', label: 'Ninja', cost: 150, emoji: '🥷' },
  { id: 'avatar-superhero', category: 'avatar', label: 'Superhero', cost: 150, emoji: '🦸' },
  { id: 'avatar-wizard', category: 'avatar', label: 'Wizard', cost: 150, emoji: '🧙' },
  { id: 'avatar-robot', category: 'avatar', label: 'Robot', cost: 120, emoji: '🤖' },
  { id: 'avatar-rocket', category: 'avatar', label: 'Rocket', cost: 120, emoji: '🚀' },
  { id: 'avatar-astronaut', category: 'avatar', label: 'Astronaut', cost: 180, emoji: '🧑‍🚀' },
  { id: 'avatar-mermaid', category: 'avatar', label: 'Mermaid', cost: 180, emoji: '🧜' },
  { id: 'avatar-vampire', category: 'avatar', label: 'Vampire', cost: 200, emoji: '🧛' },
  { id: 'avatar-fairy', category: 'avatar', label: 'Fairy', cost: 200, emoji: '🧚' },
  { id: 'avatar-genie', category: 'avatar', label: 'Genie', cost: 220, emoji: '🧞' },
  { id: 'avatar-unicorn', category: 'avatar', label: 'Unicorn', cost: 150, emoji: '🦄' },
  { id: 'avatar-alien', category: 'avatar', label: 'Alien', cost: 300, emoji: '👽' },
  { id: 'avatar-dragon', category: 'avatar', label: 'Dragon', cost: 1500, emoji: '🐉' },
  // Chest-only (Roadmap #91): no price, can't be bought — the only way to
  // get one is from the daily mystery chest (see chest.js).
  { id: 'avatar-owl', category: 'avatar', label: 'Wise Owl', chestOnly: true, emoji: '🦉' },

  // Moods — a second, independent small emoji badge (opposite corner from
  // accessories), so the character can be customised two ways at once.
  { id: 'mood-none', category: 'mood', label: 'No mood', cost: 0 },
  { id: 'mood-sparkles', category: 'mood', label: 'Sparkles', cost: 150, emoji: '✨' },
  { id: 'mood-fire', category: 'mood', label: 'On fire', cost: 150, emoji: '🔥' },
  { id: 'mood-heart', category: 'mood', label: 'Loving it', cost: 150, emoji: '💖' },
  { id: 'mood-sleepy', category: 'mood', label: 'Sleepy', cost: 120, emoji: '💤' },
  { id: 'mood-strong', category: 'mood', label: 'Strong', cost: 150, emoji: '💪' },
  { id: 'mood-lucky', category: 'mood', label: 'Lucky', chestOnly: true, emoji: '🍀' },

  // Frames — a ring drawn around the avatar via CSS.
  { id: 'frame-none', category: 'frame', label: 'No frame', cost: 0 },
  { id: 'frame-gold', category: 'frame', label: 'Gold ring', cost: 100 },
  { id: 'frame-fire', category: 'frame', label: 'Flame ring', cost: 120 },
  { id: 'frame-rainbow', category: 'frame', label: 'Rainbow ring', cost: 200 },
  { id: 'frame-diamond', category: 'frame', label: 'Diamond ring', cost: 1200 },

  // Accessories — a small emoji sticker overlaid on the avatar's corner.
  { id: 'accessory-none', category: 'accessory', label: 'No accessory', cost: 0 },
  { id: 'accessory-hat', category: 'accessory', label: 'Top hat', cost: 300, emoji: '🎩' },
  { id: 'accessory-bow', category: 'accessory', label: 'Bow', cost: 300, emoji: '🎀' },
  { id: 'accessory-sunglasses', category: 'accessory', label: 'Sunglasses', cost: 350, emoji: '🕶️' },
  { id: 'accessory-crown', category: 'accessory', label: 'Crown', cost: 600, emoji: '👑' },
  { id: 'accessory-medal', category: 'accessory', label: 'Treasure medal', chestOnly: true, emoji: '🎖️' },

  // Avatar colours — tint the circular background behind the avatar emoji.
  { id: 'avatarColor-default', category: 'avatarColor', label: 'Classic', cost: 0, swatch: '#eef0fb' },
  { id: 'avatarColor-ocean', category: 'avatarColor', label: 'Ocean', cost: 400, swatch: '#bfe3f5' },
  { id: 'avatarColor-sunset', category: 'avatarColor', label: 'Sunset', cost: 400, swatch: '#fbd0a8' },
  { id: 'avatarColor-galaxy', category: 'avatarColor', label: 'Galaxy', cost: 800, swatch: '#5a4a9e' },
  { id: 'avatarColor-gold', category: 'avatarColor', label: 'Gold', cost: 1500, swatch: '#f0c243' },
];

export const SHOP_CATEGORIES = [
  { key: 'theme', label: 'Colour theme' },
  { key: 'font', label: 'Font' },
  { key: 'avatar', label: 'Character' },
  { key: 'avatarColor', label: 'Avatar colour' },
  { key: 'accessory', label: 'Avatar accessory' },
  { key: 'mood', label: 'Avatar mood' },
  { key: 'frame', label: 'Avatar frame' },
];

export function itemsByCategory(category) {
  return SHOP_ITEMS.filter((i) => i.category === category);
}

export function getItem(id) {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export function isOwned(itemId, ownedItemIds) {
  const item = getItem(itemId);
  return !!item && (item.cost === 0 || ownedItemIds.includes(itemId));
}

export function availableBalance(meta) {
  return Math.max(0, (meta.totalPoints || 0) - (meta.spentPoints || 0));
}
