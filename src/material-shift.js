// The Material Shift experience: a virtual cube that sits exactly on the physical block,
// wears one of four materials, sweeps between them, and follows the block as it moves.
// Used by both the AR pipeline module (xr-module.js) and the desktop preview (preview.js).
import * as THREE from 'three'
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {FACES, FACE_BY_TARGET, MARKER_W, MARKER_H, cubePoseFromFace} from './faces.js'
import {createMaterialLibrary} from './materials.js'

const COVER = 1.03            // virtual cube slightly larger than the paper cube to hide its edges
const LOST_GRACE_MS = 350     // keep showing the cube briefly when tracking drops
const SWEEP_MS = 900
const SMOOTHING = 18          // higher = snappier, lower = smoother

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const easeOut = t => 1 - Math.pow(1 - t, 3)

export function createMaterialShift({scene, camera, renderer, canvas, holdToCompare = true}) {
  const $ = id => document.getElementById(id)

  // ---------- rendering setup ----------
  renderer.localClippingEnabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  const hemi = new THREE.HemisphereLight(0xfff6ea, 0x3a342e, 0.5)
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  scene.add(hemi, key, key.target)

  // ---------- materials: plain + two clipped variants for the sweep ----------
  const lib = createMaterialLibrary()
  const planeIn = new THREE.Plane(), planeOut = new THREE.Plane()
  const mats = lib.map((m) => {
    const plain = m.make()
    const clipIn = plain.clone(); clipIn.clippingPlanes = [planeIn]
    const clipOut = plain.clone(); clipOut.clippingPlanes = [planeOut]
    return {plain, clipIn, clipOut}
  })

  // ---------- cube ----------
  const root = new THREE.Group()
  root.visible = false
  scene.add(root)
  const geo = new RoundedBoxGeometry(COVER, COVER, COVER, 4, 0.035)
  const meshA = new THREE.Mesh(geo, mats[0].plain)
  const meshB = new THREE.Mesh(geo, mats[0].clipIn)
  meshB.visible = false
  meshA.castShadow = meshB.castShadow = true
  root.add(meshA, meshB)

  const ringGeo = new THREE.RingGeometry(0.535 * Math.SQRT2, 0.575 * Math.SQRT2, 4, 1)
  ringGeo.rotateZ(Math.PI / 4); ringGeo.rotateX(-Math.PI / 2)
  const ringMat = new THREE.MeshBasicMaterial({color: 0xfff0c2, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false})
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.renderOrder = 3
  root.add(ring)

  // ---------- debug: raw tracked targets + expected marker outlines ----------
  let debug = false
  const debugGroup = new THREE.Group(); debugGroup.visible = false; scene.add(debugGroup)
  const rectPts = [[-MARKER_W / 2, -MARKER_H / 2], [MARKER_W / 2, -MARKER_H / 2], [MARKER_W / 2, MARKER_H / 2], [-MARKER_W / 2, MARKER_H / 2]]
    .map(([x, y]) => new THREE.Vector3(x, y, 0))
  const debugTargets = {}
  FACES.forEach((f) => {
    const g = new THREE.Group()
    g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rectPts), new THREE.LineBasicMaterial({color: 0x00ffaa, depthTest: false})))
    g.add(new THREE.AxesHelper(0.35))
    g.visible = false
    debugGroup.add(g)
    debugTargets[f.targetName] = g
  })
  const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({color: 0xffd166, depthTest: false}))
  wire.visible = false
  root.add(wire)

  // ---------- state ----------
  let current = 0, sweep = null
  let tracking = false, lastSeen = -1e9, popT = 0, bestName = null
  let comparing = false, tipMode = false
  let tipCandidate = null, tipSince = 0, tipCommitted = null
  const pose = {pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1}
  const cand = {pos: new THREE.Vector3(), quat: new THREE.Quaternion()}
  const _n = new THREE.Vector3(), _c = new THREE.Vector3(), _up = new THREE.Vector3(), _p = new THREE.Vector3()
  const _qi = new THREE.Quaternion()
  let last = performance.now()

  // ---------- UI ----------
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms) } catch (e) { /* not supported */ } }
  let toastT
  function toast(text) {
    const el = $('matname'); if (!el) return
    el.textContent = text; el.classList.add('on')
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 900)
  }
  function setStatus(text, ok) {
    const el = $('status'); if (!el) return
    el.querySelector('span').textContent = text
    el.classList.toggle('ok', !!ok)
  }
  function buildUI() {
    const chips = $('chips')
    if (chips) {
      lib.forEach((m, i) => {
        const b = document.createElement('button')
        b.type = 'button'; b.className = 'chip'; b.id = `mat-${m.key}`
        const sw = document.createElement('canvas'); sw.width = sw.height = 64
        sw.getContext('2d').drawImage(m.swatch, 0, 0, 512, 512, 0, 0, 64, 64)
        b.append(sw, document.createTextNode(m.label))
        b.onclick = () => setMaterial(i)
        chips.appendChild(b)
      })
    }
    const tip = $('tipBtn')
    if (tip) tip.onclick = () => {
      tipMode = !tipMode; tipCommitted = null; tipCandidate = null
      tip.setAttribute('aria-pressed', tipMode)
      toast(tipMode ? 'Tip the block to shift' : 'Tap a material')
    }
    const dbg = $('debugBtn')
    if (dbg) dbg.onclick = () => {
      debug = !debug; dbg.setAttribute('aria-pressed', debug)
      debugGroup.visible = debug; wire.visible = debug
    }
    if (holdToCompare && canvas) {
      const on = () => { comparing = true; $('compare')?.classList.add('on') }
      const off = () => { comparing = false; $('compare')?.classList.remove('on') }
      canvas.addEventListener('pointerdown', on)
      canvas.addEventListener('pointerup', off)
      canvas.addEventListener('pointercancel', off)
      canvas.addEventListener('pointerleave', off)
    }
    syncChips()
  }
  function syncChips() {
    lib.forEach((m, i) => $(`mat-${m.key}`)?.setAttribute('aria-pressed', i === current))
  }

  // ---------- material switching ----------
  function finishSweep() {
    if (!sweep) return
    meshA.material = mats[sweep.to].plain
    meshB.visible = false
    ringMat.opacity = 0
    sweep = null
  }
  function setMaterial(i) {
    i = ((i % lib.length) + lib.length) % lib.length
    if (i === current && !sweep) return
    finishSweep()
    const from = current
    current = i
    syncChips()
    toast(lib[i].label)
    buzz(15)
    meshA.material = mats[from].clipOut
    meshB.material = mats[i].clipIn
    meshB.visible = true
    sweep = {from, to: i, t0: performance.now()}
  }

  function updateSweep(now) {
    if (!sweep) return
    const k = Math.min(1, (now - sweep.t0) / SWEEP_MS), e = easeInOut(k)
    const h = -0.56 + 1.12 * e
    _up.set(0, 1, 0).applyQuaternion(root.quaternion)
    _p.copy(_up).multiplyScalar(h * root.scale.x).add(root.position)
    planeIn.setFromNormalAndCoplanarPoint(_c.copy(_up).negate(), _p)   // new material below the line
    planeOut.setFromNormalAndCoplanarPoint(_up, _p)                    // old material above it
    ring.position.y = h
    ringMat.opacity = Math.sin(Math.PI * k) * 0.9
    if (k >= 1) finishSweep()
  }

  // ---------- tip to shift: which cube face points up on screen ----------
  function updateTip(now) {
    if (!tipMode || !tracking) return
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion)                // screen up in world
    _qi.copy(root.quaternion).invert()
    _up.applyQuaternion(_qi)                                           // ... in cube frame
    const ax = [Math.abs(_up.x), Math.abs(_up.y), Math.abs(_up.z)]
    const i = ax.indexOf(Math.max(...ax))
    if (ax[i] < 0.82) return                                           // mid-tip: wait
    const keyName = ['x', 'y', 'z'][i] + (_up.getComponent(i) > 0 ? '+' : '-')
    if (keyName !== tipCandidate) { tipCandidate = keyName; tipSince = now; return }
    if (now - tipSince < 350 || keyName === tipCommitted) return
    if (tipCommitted !== null) setMaterial(current + 1)
    tipCommitted = keyName
  }

  // ---------- pose input ----------
  function applyPose(dt, now) {
    if (!tracking) return
    const a = 1 - Math.exp(-dt * SMOOTHING)
    if (popT === 0) {                                                  // first frame after (re)found: snap
      pose.pos.copy(cand.pos); pose.quat.copy(cand.quat)
    } else {
      pose.pos.lerp(cand.pos, a); pose.quat.slerp(cand.quat, a)
    }
    popT = Math.min(1, popT + dt / 0.22)
    root.position.copy(pose.pos)
    root.quaternion.copy(pose.quat)
    root.scale.setScalar(pose.scale * (0.9 + 0.1 * easeOut(popT)))
  }

  /** AR: poses = Map(targetName -> {pos, quat, scale, visible}) from 8th Wall events. */
  function updateTargets(poses, now) {
    let best = null, bestScore = -Infinity
    for (const [name, p] of poses) {
      const g = debugTargets[name]
      if (g) {
        g.visible = p.visible
        if (p.visible) { g.position.copy(p.pos); g.quaternion.copy(p.quat); g.scale.setScalar(p.scale) }
      }
      const face = FACE_BY_TARGET[name]
      if (!face || !p.visible) continue
      _n.set(0, 0, 1).applyQuaternion(p.quat)
      _c.copy(camera.position).sub(p.pos).normalize()
      const score = _n.dot(_c) + (name === bestName ? 0.15 : 0)       // prefer frontal faces, avoid flicker
      if (score > bestScore) { bestScore = score; best = {face, p} }
    }
    if (best) {
      cubePoseFromFace(best.face, best.p.pos, best.p.quat, best.p.scale, cand.pos, cand.quat)
      pose.scale = pose.scale && tracking ? pose.scale + (best.p.scale - pose.scale) * 0.5 : best.p.scale
      if (!tracking) popT = 0
      lastSeen = now
      bestName = best.face.targetName
      if (!tracking) buzz(10)
      tracking = true
      setStatus(`Tracking · ${best.face.label} face`, true)
    } else if (tracking && now - lastSeen > LOST_GRACE_MS) {
      tracking = false; bestName = null
      setStatus('Point the camera at any face of the block')
    }
  }

  /** Preview: drive the cube directly. */
  function setPose(pos, quat, scale) {
    cand.pos.copy(pos); cand.quat.copy(quat); pose.scale = scale
    if (!tracking) popT = 0
    tracking = true
  }

  function tick(lighting) {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000)
    last = now
    applyPose(dt, now)
    updateSweep(now)
    updateTip(now)
    root.visible = tracking && !comparing
    // key light rides with the viewer (upper left), like a lamp behind the shoulder
    key.position.set(-0.6, 1.4, 0.8).multiplyScalar(2 * Math.max(pose.scale, 0.1)).applyQuaternion(camera.quaternion).add(camera.position)
    key.target.position.copy(root.position)
    if (lighting && typeof lighting.exposure === 'number') {          // 8th Wall light estimate, -1..1
      const f = THREE.MathUtils.clamp(1 + 0.6 * lighting.exposure, 0.4, 1.6)
      key.intensity = 2.2 * f; hemi.intensity = 0.5 * f; scene.environmentIntensity = f
    }
  }

  buildUI()
  setStatus('Point the camera at any face of the block')
  return {updateTargets, setPose, tick, setMaterial, root, get current() { return current }}
}
