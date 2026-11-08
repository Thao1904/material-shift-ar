// Pen measurements (cm) and sticker color. Correct them in the Calibrate panel on the phone.
export const DEFAULT_PEN = {
  spacing: 12,       // distance between the CENTERS of the two stickers
  length: 14.5,      // whole pen length (the stickers are assumed roughly symmetric around the middle)
  diameter: 1.05,    // pen diameter where the stickers are
  hueMin: 60,        // sticker color range in degrees (lime/neon green ~ 70-100)
  hueMax: 125,
  satMin: 0.3,
  valMin: 90,
  fov: 64,           // camera field of view along the longer image side (degrees)
}
