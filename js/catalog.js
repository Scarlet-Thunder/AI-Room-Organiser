// Furniture catalog. Dimensions in metres: w = width (side to side), d = depth
// (back to front), h = height. Every item faces local +z (its "front").
// Prices are typical USD ranges for each tier; tweak freely.

export const TIERS = ['Essential', 'Mid', 'Premium'];

export const CATALOG = {
  bed_queen: { name: 'Queen bed', cat: 'Sleeping', icon: '🛏️', w: 1.6, d: 2.1, h: 1.1, prices: [300, 750, 1800], wall: 40, commanding: 'bed', access: { sides: 0.55, front: 0.5 } },
  bed_king: { name: 'King bed', cat: 'Sleeping', icon: '🛏️', w: 1.95, d: 2.15, h: 1.15, prices: [450, 1100, 2600], wall: 40, commanding: 'bed', access: { sides: 0.55, front: 0.5 } },
  bed_twin: { name: 'Twin bed', cat: 'Sleeping', icon: '🛏️', w: 1.0, d: 2.0, h: 1.0, prices: [180, 450, 1000], wall: 40, commanding: 'bed', access: { sides: 0.5, front: 0.4 } },
  nightstand: { name: 'Nightstand', cat: 'Sleeping', icon: '🗄️', w: 0.5, d: 0.4, h: 0.6, prices: [60, 150, 400], wall: 10, attach: 'bed' },
  wardrobe: { name: 'Wardrobe', cat: 'Storage', icon: '🚪', w: 1.2, d: 0.6, h: 2.0, prices: [200, 550, 1400], wall: 30, access: { front: 0.75 } },
  dresser: { name: 'Dresser', cat: 'Storage', icon: '🗃️', w: 1.2, d: 0.5, h: 0.85, prices: [150, 400, 1100], wall: 25, access: { front: 0.65 } },
  bookshelf: { name: 'Bookshelf', cat: 'Storage', icon: '📚', w: 0.8, d: 0.35, h: 1.8, prices: [70, 200, 600], wall: 25, access: { front: 0.55 } },
  desk: { name: 'Desk', cat: 'Work', icon: '🖥️', w: 1.4, d: 0.7, h: 0.75, prices: [120, 350, 900], wall: 20, commanding: 'desk', access: { front: 0.9 } },
  office_chair: { name: 'Office chair', cat: 'Work', icon: '💺', w: 0.65, d: 0.65, h: 1.1, prices: [90, 280, 900], attach: 'desk' },
  sofa: { name: 'Sofa (3-seat)', cat: 'Living', icon: '🛋️', w: 2.1, d: 0.9, h: 0.85, prices: [400, 1100, 2800], wall: 30, commanding: 'sofa', access: { front: 0.45 } },
  loveseat: { name: 'Loveseat', cat: 'Living', icon: '🛋️', w: 1.5, d: 0.9, h: 0.85, prices: [300, 800, 2000], wall: 30, commanding: 'sofa', access: { front: 0.45 } },
  armchair: { name: 'Armchair', cat: 'Living', icon: '🪑', w: 0.85, d: 0.85, h: 0.85, prices: [180, 450, 1200], wall: 0, access: { front: 0.4 } },
  coffee_table: { name: 'Coffee table (round)', cat: 'Living', icon: '☕', w: 0.9, d: 0.9, h: 0.42, prices: [80, 250, 700], attach: 'sofa', round: true },
  side_table: { name: 'Side table', cat: 'Living', icon: '🔘', w: 0.45, d: 0.45, h: 0.55, prices: [40, 120, 350], attach: 'sofa', round: true },
  tv_stand: { name: 'TV + stand', cat: 'Living', icon: '📺', w: 1.6, d: 0.45, h: 1.25, prices: [420, 900, 2200], wall: 30, access: { front: 0.5 } },
  dining_set: { name: 'Dining set (4 chairs)', cat: 'Dining', icon: '🍽️', w: 1.4, d: 1.9, h: 0.9, prices: [300, 800, 2200], wall: 0, access: { around: 0.45 } },
  floor_lamp: { name: 'Floor lamp', cat: 'Decor', icon: '💡', w: 0.4, d: 0.4, h: 1.6, prices: [40, 120, 400], wall: 0, round: true },
  plant: { name: 'Large plant', cat: 'Decor', icon: '🪴', w: 0.5, d: 0.5, h: 1.3, prices: [30, 80, 250], wall: 0, round: true },
  rug: { name: 'Area rug', cat: 'Decor', icon: '🟫', w: 2.0, d: 1.4, h: 0.01, prices: [80, 250, 800], attach: 'rug', floor: true },
  mirror: { name: 'Floor mirror', cat: 'Decor', icon: '🪞', w: 0.6, d: 0.12, h: 1.7, prices: [60, 180, 500], wall: 25, access: { front: 0.6 } },
};

// Higher = more worth upgrading when budget allows (you use it every day).
export const UPGRADE_WEIGHT = {
  bed_queen: 5, bed_king: 5, bed_twin: 5, sofa: 4, loveseat: 4, office_chair: 4, desk: 3,
  dining_set: 3, wardrobe: 2, armchair: 2, dresser: 2, tv_stand: 2, mirror: 1, rug: 1,
  nightstand: 1, bookshelf: 1, coffee_table: 1, side_table: 1, floor_lamp: 1, plant: 1,
};

export const ROOM_PRESETS = {
  bedroom: {
    label: 'Bedroom', width: 4.2, depth: 3.8, budget: 3000,
    door: { wall: 'S', offset: 3.5, width: 0.9 },
    windows: [{ wall: 'N', offset: 2.1, width: 1.4 }],
    items: [['bed_queen', 1, true], ['nightstand', 2, true], ['wardrobe', 1, true], ['dresser', 1, false],
      ['rug', 1, false], ['plant', 1, false], ['floor_lamp', 1, false], ['mirror', 1, false]],
  },
  living: {
    label: 'Living room', width: 5.2, depth: 4.4, budget: 4000,
    door: { wall: 'S', offset: 0.8, width: 0.9 },
    windows: [{ wall: 'E', offset: 2.2, width: 1.8 }],
    items: [['sofa', 1, true], ['coffee_table', 1, true], ['tv_stand', 1, true], ['armchair', 1, false],
      ['side_table', 1, false], ['rug', 1, false], ['floor_lamp', 1, false], ['plant', 2, false], ['bookshelf', 1, false]],
  },
  office: {
    label: 'Home office', width: 3.6, depth: 3.2, budget: 2000,
    door: { wall: 'S', offset: 0.7, width: 0.85 },
    windows: [{ wall: 'W', offset: 1.6, width: 1.2 }],
    items: [['desk', 1, true], ['office_chair', 1, true], ['bookshelf', 2, false], ['armchair', 1, false],
      ['plant', 1, false], ['floor_lamp', 1, false]],
  },
  studio: {
    label: 'Studio apartment', width: 6.0, depth: 4.5, budget: 5000,
    door: { wall: 'S', offset: 5.2, width: 0.9 },
    windows: [{ wall: 'N', offset: 1.8, width: 1.6 }, { wall: 'N', offset: 4.4, width: 1.2 }],
    items: [['bed_queen', 1, true], ['nightstand', 1, true], ['loveseat', 1, true], ['coffee_table', 1, false],
      ['desk', 1, false], ['office_chair', 1, false], ['wardrobe', 1, true], ['plant', 2, false], ['rug', 1, false]],
  },
};
