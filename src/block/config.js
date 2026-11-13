// Measurements of the physical block (cm). Correct them in the Calibrate panel on the phone
// (saved on that phone), or change them here for everyone.
export const DEFAULT_BLOCK = {
  W: 8,            // width  (long edge of the side faces)
  D: 8,            // depth  (the other edge of the big face)
  T: 2,            // thickness
  topInset: 0.65,  // big faces: 4 dots, dot center to the nearest edges (fitted from photos)
  sideDots: 2,     // side faces: 2 dots, centered across the thickness, one near each end
  sideEnd: 0.6,    // side faces: dot center to the end of the face (fitted from photos)
  // older layout (4 dots per side face), still understood when sideDots is 4:
  sideInsetX: 0.4,
  sideInsetY: 0.5,
  markOffset: 0.8, // black origin mark: from one red dot on the top face, this far toward the center along both edges
  fov: 66,         // camera field of view along the longer image side (degrees)
}
