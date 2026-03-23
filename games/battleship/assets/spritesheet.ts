// ============================================================
// BATTLESHIP — Spritesheet sprite definitions
// ============================================================
// Spritesheet: games/battleship/assets/ships-spritesheet.png
// Total size: 1024×1024 px
// Background: dark navy (~#1c2730)
//
// Layout (left → right, vertically oriented ships):
//   1. Water tile  — top-left square
//   2. Carrier     — 5 cells
//   3. Battleship  — 4 cells
//   4. Cruiser     — 3 cells
//   5. Submarine   — 3 cells (darker / sleek)
//   6. Destroyer   — 2 cells (top sprite in right column)
//
// All coordinates are { x, y, width, height } in pixels.
// Ships are drawn VERTICALLY in the sheet; rotate -90deg for horizontal placement.

export const SPRITES = {
  water: {
    x: 29,
    y: 125,
    width: 266,
    height: 264,
  },
  carrier: {
    x: 301,
    y: 135,
    width: 183,
    height: 790,
  },
  battleship: {
    x: 514,
    y: 135,
    width: 118,
    height: 628,
  },
  cruiser: {
    x: 659,
    y: 136,
    width: 90,
    height: 543,
  },
  submarine: {
    x: 788,
    y: 135,
    width: 88,
    height: 549,
  },
  destroyer: {
    x: 912,
    y: 135,
    width: 64,
    height: 408,
  },
} as const;

export type SpriteName = keyof typeof SPRITES;

/** Map from ship ID (from constants.ts) to sprite key */
export const SHIP_SPRITE_MAP: Record<string, SpriteName> = {
  carrier: 'carrier',
  battleship: 'battleship',
  cruiser: 'cruiser',
  submarine: 'submarine',
  destroyer: 'destroyer',
};

/** Full spritesheet dimensions */
export const SHEET_WIDTH = 1024;
export const SHEET_HEIGHT = 1024;
