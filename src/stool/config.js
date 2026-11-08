// SONGMICS small storage ottoman with legs (ULSF012 series): 40 x 32 x 33.5 cm (W x D x H),
// 3 x 3 tufted lid. Correct the numbers in the Calibrate panel if your model differs.
export const DEFAULT_STOOL = {
  W: 40,             // seat width (long side)
  D: 32,             // seat depth
  H: 33.5,           // total height, floor to seat
  lidT: 6.5,         // lid / cushion thickness
  overhang: 0.8,     // lid sticks out past the body on each side
  legH: 3,           // leg height
  inset: 1.2,        // sticker centers: distance from the seat edges (fitted from the photo)
  hueMin: 60,        // sticker color (lime green)
  hueMax: 125,
  satMin: 0.3,
  valMin: 90,
  fov: 64,
}

/** The 8 seat stickers in stool coordinates (cm; origin = center of the seat top, Y up). */
export function seatStickers(cfg) {
  const a = cfg.W / 2 - cfg.inset, b = cfg.D / 2 - cfg.inset, n = [0, 1, 0]
  return [[-a, -b], [a, -b], [a, b], [-a, b], [0, -b], [a, 0], [0, b], [-a, 0]].map(([x, z]) => ({p: [x, 0, z], n}))
}
