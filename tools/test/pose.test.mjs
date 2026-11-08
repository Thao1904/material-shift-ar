// node tools/test/pose.test.mjs : every face must give back the same cube pose
import * as THREE from 'three'
import {FACES, cubePoseFromFace, facePoseFromCube} from '../../src/faces.js'
let worst = 0
for (let trial = 0; trial < 200; trial++) {
  const P = new THREE.Vector3(Math.random() - .5, Math.random() - .5, -Math.random() - .3)
  const Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6))
  const s = 0.05 + Math.random() * 0.2
  for (const f of FACES) {
    const tp = new THREE.Vector3(), tq = new THREE.Quaternion(), cp = new THREE.Vector3(), cq = new THREE.Quaternion()
    facePoseFromCube(f, P, Q, s, tp, tq)
    // target normal (+Z) must equal the face's outward normal in world
    const nWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(tq), expect = f.n.clone().applyQuaternion(Q)
    worst = Math.max(worst, nWorld.distanceTo(expect))
    cubePoseFromFace(f, tp, tq, s, cp, cq)
    worst = Math.max(worst, cp.distanceTo(P), 1 - Math.abs(cq.dot(Q)))
  }
}
// net check: each face's marker "up" must point to the neighbour drawn above it in the net
const up = n => FACES.find(f => f.name === n).up.join()
console.assert(up('front') === '0,1,0' && up('top') === '0,0,-1' && up('bottom') === '0,0,1', 'net orientation')
console.log('max error', worst.toExponential(2), worst < 1e-6 ? 'PASS' : 'FAIL')
