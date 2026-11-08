// Measurements of the physical block (cm). Correct them in the Calibrate panel on the phone
// (saved on that phone), or change them here for everyone.
export const DEFAULT_BLOCK = {
  W: 8,            // width  (long edge of the side faces)
  D: 8,            // depth  (the other edge of the big face)
  T: 2,            // thickness
  topInset: 0.5,   // big faces: dot center to the nearest edges (estimated from photo)
  sideInsetX: 0.4, // side faces: dot center to the short (vertical) edges (estimated)
  sideInsetY: 0.5, // side faces: dot center to the long (horizontal) edges (fitted from photo: rows ~1 cm apart)
  markOffset: 0.8, // black origin mark: from one red dot on the top face, this far toward the center along both edges
  fov: 66,         // camera field of view along the longer image side (degrees)
}
