// Several virtual pens, one per tracked real pen. Each pen follows its own pair of stickers.
// One global material for all pens (chips / swipe), and any pen can be tapped to give it
// its own material.
import * as THREE from 'three'
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js'
import {createMaterialLibrary} from '../materials.js'

export const PEN_COLORS = [
  {key: 'red', label: 'Red', hex: 0xe0453a}, {key: 'blue', label: 'Blue', hex: 0x2f6fd0},
  {key: 'yellow', label: 'Yellow', hex: 0xf2c230}, {key: 'black', label: 'Black', hex: 0x1d1f22},
]
const LOST_MS = 400

export function createPenLayer({scene, camera, renderer, canvas}) {
  renderer.localClippingEnabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x3a342e, 0.5)
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  scene.add(hemi, key, key.target)

  const lib = createMaterialLibrary(PEN_COLORS)
  const planeIn = new THREE.Plane(), planeOut = new THREE.Plane()
  const mats = lib.map((m) => {
    const plain = m.make()
    const clipIn = plain.clone(); clipIn.clippingPlanes = [planeIn]
    const clipOut = plain.clone(); clipOut.clippingPlanes = [planeOut]
    return {plain, clipIn, clipOut}
  })

  let globalMat = 0, comparing = false, scrub = null, nextId = 1
  const pens = []
  const Y = new THREE.Vector3(0, 1, 0)

  function makePen(dia, len) {
    const g = new THREE.Group()
    const geo = new THREE.CapsuleGeometry(dia / 2 * 1.06, Math.max(0.1, len - dia), 8, 32)
    const meshA = new THREE.Mesh(geo, mats[globalMat].plain)
    const meshB = new THREE.Mesh(geo, mats[0].clipIn); meshB.visible = false
    g.add(meshA, meshB)
    scene.add(g)
    return {id: nextId++, group: g, meshA, meshB, geoDia: dia, geoLen: len, pos: new THREE.Vector3(), quat: new THREE.Quaternion(),
      dir: new THREE.Vector3(0, 1, 0), dia, img: null, seen: 0, born: performance.now(), mat: null, pop: 0, fresh: true}
  }
  function removePen(p) { scene.remove(p.group); p.meshA.geometry.dispose(); pens.splice(pens.indexOf(p), 1) }
  const matOf = p => (p.mat === null ? globalMat : p.mat)

  const tPos = new THREE.Vector3(), tDir = new THREE.Vector3(), tQuat = new THREE.Quaternion()

  /** Feed this frame's detections: [{pair, center, dir, diameter}] in the OpenCV camera frame. */
  function update(dets, cfg, now) {
    const ext = Math.max(0, (cfg.length - cfg.spacing) / 2)
    const free = new Set(pens)
    for (const d of dets) {
      const img = {x: (d.pair.a.x + d.pair.b.x) / 2, y: (d.pair.a.y + d.pair.b.y) / 2}
      let best = null, bd = 90
      for (const p of free) { if (!p.img) continue; const dd = Math.hypot(p.img.x - img.x, p.img.y - img.y); if (dd < bd) { bd = dd; best = p } }
      const len = cfg.spacing + 2 * ext
      if (!best) { best = makePen(d.diameter, len); pens.push(best) }
      free.delete(best)
      best.img = img; best.seen = now
      best.dia += (d.diameter - best.dia) * 0.15
      tPos.set(d.center[0], -d.center[1], -d.center[2])
      tDir.set(d.dir[0], -d.dir[1], -d.dir[2])
      if (!best.fresh && tDir.dot(best.dir) < 0) tDir.negate()          // the pen has no "up": keep the sign stable
      best.target = {pos: tPos.clone(), dir: tDir.clone()}
      // rebuild the shape when this pen's measured thickness or the configured length changed
      if (Math.abs(best.dia - best.geoDia) / best.geoDia > 0.08 || Math.abs(len - best.geoLen) > 0.2) {
        const geo = new THREE.CapsuleGeometry(best.dia / 2 * 1.06, Math.max(0.1, len - best.dia), 8, 32)
        best.meshA.geometry.dispose(); best.meshA.geometry = geo; best.meshB.geometry = geo
        best.geoDia = best.dia; best.geoLen = len
      }
    }
    for (const p of [...free]) if (now - p.seen > LOST_MS) removePen(p)
  }

  let last = performance.now()
  function tick(lighting) {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now
    for (const p of pens) {
      if (!p.target) continue
      if (p.fresh) { p.pos.copy(p.target.pos); p.dir.copy(p.target.dir); p.fresh = false }
      else {
        const ang = p.dir.angleTo(p.target.dir), mv = p.pos.distanceTo(p.target.pos) / 10
        const a = 1 - Math.exp(-dt * (8 + 50 * Math.min(1, ang * 5 + mv * 8)))
        p.pos.lerp(p.target.pos, a); p.dir.lerp(p.target.dir, a).normalize()
      }
      tQuat.setFromUnitVectors(Y, p.dir)
      p.group.position.copy(p.pos); p.group.quaternion.copy(tQuat)
      const grow = Math.min(1, (now - p.born) / 220), pop = p.pop > 0 ? Math.sin(Math.min(1, (now - p.pop) / 260) * Math.PI) * 0.08 : 0
      p.group.scale.setScalar(0.85 + 0.15 * grow + pop)
      p.group.visible = !comparing && now - p.seen < LOST_MS
    }
    key.position.set(-1.2, 2.8, 1.6).multiplyScalar(20).applyQuaternion(camera.quaternion).add(camera.position)
    key.target.position.set(0, 0, -30).applyQuaternion(camera.quaternion)
    if (lighting && typeof lighting.exposure === 'number') {
      const f = THREE.MathUtils.clamp(1 + 0.6 * lighting.exposure, 0.4, 1.6)
      key.intensity = 2.2 * f; hemi.intensity = 0.5 * f; scene.environmentIntensity = f
    }
  }

  // ---------- screen-space swipe between global materials (pens with their own material keep it) ----------
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3()
  function keepRightOf(x, plane) {
    const w = canvas.clientWidth || innerWidth, nx = (x / w) * 2 - 1, cam = camera.position
    _a.set(nx, 1, 0.5).unproject(camera).sub(cam); _b.set(nx, -1, 0.5).unproject(camera).sub(cam)
    _n.crossVectors(_a, _b).normalize()
    _t.set(Math.min(1, nx + 0.3), 0, 0.5).unproject(camera).sub(cam)
    if (_n.dot(_t) < 0) _n.negate()
    plane.setFromNormalAndCoplanarPoint(_n, cam)
  }
  function scrubStart(next, side) {
    scrub = {next, side}
    for (const p of pens) {
      if (p.mat !== null) continue
      p.meshA.material = mats[globalMat].clipOut
      p.meshB.material = mats[next].clipIn; p.meshB.visible = true
    }
  }
  function scrubSet(x) {
    if (!scrub) return
    keepRightOf(x, planeIn); planeOut.copy(planeIn).negate()
    if (scrub.side === 'left') { planeIn.negate(); planeOut.negate() }
  }
  function scrubEnd(commit) {
    if (!scrub) return
    if (commit) globalMat = scrub.next
    scrub = null
    for (const p of pens) { p.meshA.material = mats[matOf(p)].plain; p.meshB.visible = false }
  }
  function setGlobal(i) {
    globalMat = i
    for (const p of pens) if (p.mat === null) { p.meshA.material = mats[i].plain; p.pop = performance.now() }
  }

  // ---------- tap a pen: give it its own material ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
  function tapAt(sx, sy) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const hits = ray.intersectObjects(pens.filter(p => p.group.visible).map(p => p.meshA))
    if (!hits.length) return null
    const p = pens.find(q => q.meshA === hits[0].object)
    p.mat = (matOf(p) + 1) % lib.length
    if (p.mat === globalMat) p.mat = null                              // back in step with the others
    p.meshA.material = mats[matOf(p)].plain
    p.pop = performance.now()
    return lib[matOf(p)].label
  }

  return {update, tick, scrubStart, scrubSet, scrubEnd, setGlobal, tapAt, lib,
    set comparing(v) { comparing = v }, get count() { return pens.filter(p => performance.now() - p.seen < LOST_MS).length },
    get global() { return globalMat }, get scrubbing() { return !!scrub }, pens}
}
