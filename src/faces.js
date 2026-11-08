// Cube geometry and the math that turns ONE tracked face into the pose of the whole cube.
//
// Cube frame: X right, Y up, Z toward the viewer (front face). Edge length = 1 unit.
// 8th Wall image target frame: the image lies in its local XY plane,
//   +X = image right, +Y = image up, +Z = out of the image (toward the camera).
//   The image's longer side (height for our 3:4 portrait markers) is 1 unit * detail.scale.
// Our markers are as tall as a cube edge and centered on their face, so one unit of the
// target frame equals one cube edge, and the cube center sits 0.5 units behind the image.
import * as THREE from 'three'

// right/up = marker right/up as printed in the net, normal = outward face normal.
export const FACES = [
  {name: 'front', label: 'Front', right: [1, 0, 0], up: [0, 1, 0], normal: [0, 0, 1]},
  {name: 'right', label: 'Right', right: [0, 0, -1], up: [0, 1, 0], normal: [1, 0, 0]},
  {name: 'back', label: 'Back', right: [-1, 0, 0], up: [0, 1, 0], normal: [0, 0, -1]},
  {name: 'left', label: 'Left', right: [0, 0, 1], up: [0, 1, 0], normal: [-1, 0, 0]},
  {name: 'top', label: 'Top', right: [1, 0, 0], up: [0, 0, -1], normal: [0, 1, 0]},
  {name: 'bottom', label: 'Bottom', right: [1, 0, 0], up: [0, 0, 1], normal: [0, -1, 0]},
]

// Marker size relative to the cube edge (3:4 marker, height = edge).
export const MARKER_W = 0.75
export const MARKER_H = 1.0

const m = new THREE.Matrix4()
FACES.forEach((f) => {
  const r = new THREE.Vector3(...f.right), u = new THREE.Vector3(...f.up), n = new THREE.Vector3(...f.normal)
  m.makeBasis(r, u, n)                                        // target frame -> cube frame
  f.q = new THREE.Quaternion().setFromRotationMatrix(m)
  f.qInv = f.q.clone().invert()
  f.n = n
  f.targetName = `face-${f.name}`
})
export const FACE_BY_TARGET = Object.fromEntries(FACES.map(f => [f.targetName, f]))

const _v = new THREE.Vector3()

/**
 * Cube pose from one face's tracked image pose.
 * @param face       entry of FACES
 * @param tPos/tQuat image target position / rotation (world)
 * @param s          image target scale (world units per marker height = per cube edge)
 */
export function cubePoseFromFace(face, tPos, tQuat, s, outPos, outQuat) {
  outQuat.copy(tQuat).multiply(face.qInv)
  _v.set(0, 0, -0.5 * s).applyQuaternion(tQuat)
  outPos.copy(tPos).add(_v)
}

/** Inverse, used by the desktop preview and the tests: where a face's target would be. */
export function facePoseFromCube(face, cPos, cQuat, s, outPos, outQuat) {
  outQuat.copy(cQuat).multiply(face.q)
  _v.copy(face.n).multiplyScalar(0.5 * s).applyQuaternion(cQuat)
  outPos.copy(cPos).add(_v)
}
