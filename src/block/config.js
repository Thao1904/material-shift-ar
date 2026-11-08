// Measurements of the physical block (cm). Estimated from photos; correct them in the
// Calibrate panel on the phone (saved on that phone), or change them here for everyone.
export const DEFAULT_BLOCK = {
  W: 10,           // width  (long edge of the side faces)
  D: 10,           // depth  (the other edge of the big face)
  T: 3,            // thickness
  topInset: 0.6,   // big faces: dot center to the nearest edges
  sideInsetX: 0.5, // side faces: dot center to the short (vertical) edges
  sideInsetY: 0.88, // side faces: dot center to the long (horizontal) edges (fitted from photo: rows ~1.25 cm apart)
  fov: 66,         // camera field of view along the longer image side (degrees)
}
