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

// Box geometry with UVs projected by face, so textures keep their real proportions on thin sides.
function makeBoxGeometry(box, cover = COVER) {
  const r = Math.min(box.w, box.h, box.d) * 0.035
  const g = new RoundedBoxGeometry(box.w * cover, box.h * cover, box.d * cover, 4, r)
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv
  const k = 1 / Math.max(box.w, box.h, box.d)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i))
    if (ax >= ay && ax >= az) uv.setXY(i, z * k + 0.5, y * k + 0.5)
    else if (ay >= az) uv.setXY(i, x * k + 0.5, z * k + 0.5)
    else uv.setXY(i, x * k + 0.5, y * k + 0.5)
  }
  uv.needsUpdate = true
  return g
}

// Thin glowing rectangle that rides the sweep line, lying across `axis`.
function makeSweepFrame(box, axis, mat) {
  const g = new THREE.Group()
  const dims = {x: box.w, y: box.h, z: box.d}
  const [a, b] = {x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y']}[axis]
  const A = dims[a] * 1.07, B = dims[b] * 1.07, th = Math.min(A, B) * 0.035
  const bar = (len, along, offAxis, off) => {
    const s = {x: th, y: th * 0.3, z: th}
    s[axis] = th * 0.3; s[along] = len; s[offAxis] = th
    const m = new THREE.Mesh(new THREE.BoxGeometry(s.x, s.y, s.z), mat)
    m.position[offAxis] = off
    g.add(m)
  }
  bar(A, a, b, B / 2); bar(A, a, b, -B / 2); bar(B, b, a, A / 2); bar(B, b, a, -A / 2)
  return g
}

export function createMaterialShift({scene, camera, renderer, canvas, holdToCompare = true, box = {w: 1, h: 1, d: 1}, sweepAxis = 'y', onChip = null, cover = COVER}) {
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
    const mixIn = makeMixMaterial(plain); mixIn.clippingPlanes = [planeIn]
    const mixOut = makeMixMaterial(plain); mixOut.clippingPlanes = [planeOut]
    return {plain, clipIn, clipOut, mix: makeMixMaterial(plain), mixIn, mixOut}
  })

  // ---------- mix overlay: another material shows through in noise patches ----------
  // The noise is evaluated in BLOCK coordinates, so two phones aligned on the same block
  // see the same patches on the same spots of the real block.
  const mixU = {value: 0.5}, freqU = {value: 2.8 / Math.max(box.w, box.h, box.d)}
  function makeMixMaterial(plain) {
    const m = plain.clone()
    m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uMix = mixU; sh.uniforms.uFreq = freqU
      sh.vertexShader = 'varying vec3 vMsLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vMsLocal = position;')
      sh.fragmentShader = `uniform float uMix; uniform float uFreq; varying vec3 vMsLocal;
        float msH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float msN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(msH(i), msH(i + vec3(1,0,0)), f.x), mix(msH(i + vec3(0,1,0)), msH(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(msH(i + vec3(0,0,1)), msH(i + vec3(1,0,1)), f.x), mix(msH(i + vec3(0,1,1)), msH(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float msF(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * msN(p); p *= 2.03; a *= 0.5; } return s; }
      ` + sh.fragmentShader
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float msVal = msF(vMsLocal * uFreq + 3.7);
          float msThr = mix(0.2, 0.76, uMix);
          if (msVal > msThr) discard;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          diffuseColor.rgb *= mix(0.55, 1.0, smoothstep(0.0, 0.02, msThr - msVal));   // thin inlay seam`)
    }
    m.customProgramCacheKey = () => 'ms-mix'
    return m
  }

  // ---------- cube ----------
  const root = new THREE.Group()
  root.visible = false
  scene.add(root)
  let geo = makeBoxGeometry(box, cover)
  const meshA = new THREE.Mesh(geo, mats[0].plain)
  const meshB = new THREE.Mesh(geo, mats[0].clipIn)
  meshB.visible = false
  const meshM = new THREE.Mesh(geo, mats[1].mix)
  meshM.visible = false
  meshM.renderOrder = 1
  const meshM2 = new THREE.Mesh(geo, mats[1].mixIn)     // overlay of the incoming state during a swipe
  meshM2.visible = false
  meshM2.renderOrder = 1
  meshA.castShadow = meshB.castShadow = true
  root.add(meshA, meshB, meshM, meshM2)

  const axisVec = new THREE.Vector3(sweepAxis === 'x' ? 1 : 0, sweepAxis === 'y' ? 1 : 0, sweepAxis === 'z' ? 1 : 0)
  const ringMat = new THREE.MeshBasicMaterial({color: 0xfff0c2, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false})
  let ring = makeSweepFrame(box, sweepAxis, ringMat)
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
  wire.scale.set(box.w, box.h, box.d)
  root.add(wire)

  /** Change the box size (e.g. after calibration). */
  function setBox(b) {
    box = b
    const old = geo
    geo = makeBoxGeometry(box, cover)
    meshA.geometry = geo; meshB.geometry = geo; meshM.geometry = geo; meshM2.geometry = geo
    freqU.value = 2.8 / Math.max(box.w, box.h, box.d)
    old.dispose()
    root.remove(ring)
    ring = makeSweepFrame(box, sweepAxis, ringMat); ring.renderOrder = 3
    root.add(ring)
    wire.scale.set(box.w, box.h, box.d)
  }

  // ---------- state ----------
  let current = 0, selected = 0, overlay = null, sweep = null
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
        b.onclick = () => (onChip ? onChip(i) : setMaterial(i))
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
      // a short tap stays free for other uses (placing objects); compare starts after a 280 ms hold
      let holdT = null, holdStart = null
      const on = () => { clearTimeout(holdT); holdT = setTimeout(() => { if (scrub) return; comparing = true; $('compare')?.classList.add('on') }, 280) }
      const off = () => { clearTimeout(holdT); comparing = false; $('compare')?.classList.remove('on') }
      cancelHold = off
      canvas.addEventListener('pointerdown', (e) => { holdStart = [e.clientX, e.clientY]; on() })
      canvas.addEventListener('pointermove', (e) => {      // moving = swiping, not comparing
        if (holdStart && Math.hypot(e.clientX - holdStart[0], e.clientY - holdStart[1]) > 10) { clearTimeout(holdT); holdStart = null }
      })
      canvas.addEventListener('pointerup', off)
      canvas.addEventListener('pointercancel', off)
      canvas.addEventListener('pointerleave', off)
    }
    syncChips()
  }
  function syncChips() {
    lib.forEach((m, i) => $(`mat-${m.key}`)?.setAttribute('aria-pressed', i === selected))
  }
  /** Which chip is highlighted (the person's own choice), independent of what is displayed. */
  function setSelected(i) { selected = i; syncChips() }

  /** Show material j through noise patches on top of the base material (null = off). */
  // ---------- swipe: screen-space wipe between the shown state and another one ----------
  // A vertical line follows the finger. On one side of it the block keeps its current look,
  // on the other side it already shows the next layer. Both sides are clipped by planes that
  // pass through the camera and the line, so the split stays straight on screen.
  let scrub = null, cancelHold = () => {}
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3()
  function keepRightOf(x, plane) {
    const w = canvas.clientWidth || innerWidth, nx = (x / w) * 2 - 1
    const cam = camera.position
    _a.set(nx, 1, 0.5).unproject(camera).sub(cam)
    _b.set(nx, -1, 0.5).unproject(camera).sub(cam)
    const n = _c.crossVectors(_a, _b).normalize()
    _t.set(Math.min(1, nx + 0.3), 0, 0.5).unproject(camera).sub(cam)
    if (n.dot(_t) < 0) n.negate()
    plane.setFromNormalAndCoplanarPoint(n, cam)
  }
  /** Begin a swipe toward `next` = {base, over, ratio}; side = where the next state appears. */
  function scrubStart(next, side) {
    finishSweep()
    cancelHold()
    scrub = {next, side}
    meshA.material = mats[current].clipOut
    if (overlay !== null) meshM.material = mats[overlay].mixOut
    meshB.material = mats[next.base].clipIn
    meshB.visible = true
    if (next.over !== null && next.over !== undefined) {
      meshM2.material = mats[next.over].mixIn; meshM2.visible = true
      mixU.value = next.ratio
    } else meshM2.visible = false
  }
  /** Move the split line to screen x (CSS px). */
  function scrubSet(x) {
    if (!scrub) return
    const inPlane = planeIn, outPlane = planeOut
    keepRightOf(x, inPlane)
    outPlane.copy(inPlane).negate()
    if (scrub.side === 'left') { inPlane.negate(); outPlane.negate() }
  }
  /** Finish: commit to the next state, or snap back. */
  function scrubEnd(commit) {
    if (!scrub) return
    const n = scrub.next
    scrub = null
    if (commit) { current = n.base; overlay = n.over ?? null; if (overlay !== null) mixU.value = n.ratio }
    meshA.material = mats[current].plain
    meshB.visible = false; meshM2.visible = false
    if (overlay !== null) { meshM.material = mats[overlay].mix; meshM.visible = true } else meshM.visible = false
  }
  /** Compile every material variant once, so the first swipe does not stutter. */
  function prewarm() {
    const g = new THREE.Group()
    for (const m of mats) for (const k of ['plain', 'clipIn', 'clipOut', 'mix', 'mixIn', 'mixOut']) {
      const mesh = new THREE.Mesh(geo, m[k]); mesh.frustumCulled = false; g.add(mesh)
    }
    scene.add(g)
    try { renderer.compile(scene, camera) } catch (e) { /* compile lazily instead */ }
    scene.remove(g)
  }

  function setOverlay(j, ratio = 0.5) {
    overlay = j
    mixU.value = ratio
    if (j === null || j === undefined) { meshM.visible = false; return }
    meshM.material = mats[j].mix
    meshM.visible = true
  }

  // ---------- material switching ----------
  function finishSweep() {
    if (!sweep) return
    meshA.material = mats[sweep.to].plain
    meshB.visible = false
    ringMat.opacity = 0
    sweep = null
  }
  function setMaterial(i, quiet = false) {
    i = ((i % lib.length) + lib.length) % lib.length
    if (!onChip) selected = i
    if (i === current && !sweep) { syncChips(); return }
    finishSweep()
    const from = current
    current = i
    syncChips()
    if (!quiet) { toast(lib[i].label); buzz(15) }
    meshA.material = mats[from].clipOut
    meshB.material = mats[i].clipIn
    meshB.visible = true
    sweep = {from, to: i, t0: performance.now()}
  }

  function updateSweep(now) {
    if (!sweep) return
    const k = Math.min(1, (now - sweep.t0) / SWEEP_MS), e = easeInOut(k)
    const L = {x: box.w, y: box.h, z: box.d}[sweepAxis]
    const h = (-0.56 + 1.12 * e) * L
    _up.copy(axisVec).applyQuaternion(root.quaternion)
    _p.copy(_up).multiplyScalar(h * root.scale.x).add(root.position)
    planeIn.setFromNormalAndCoplanarPoint(_c.copy(_up).negate(), _p)   // new material on the start side
    planeOut.setFromNormalAndCoplanarPoint(_up, _p)                    // old material on the far side
    ring.position.set(0, 0, 0); ring.position[sweepAxis] = h
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
    if (tipCommitted !== null) { if (onChip) onChip((selected + 1) % lib.length); else setMaterial(current + 1) }
    tipCommitted = keyName
  }

  // ---------- pose input ----------
  function applyPose(dt, now) {
    if (!tracking) return
    // adaptive: smooth when the object is still (no jitter), near-instant when it moves (no lag)
    const ang = 2 * Math.acos(Math.min(1, Math.abs(pose.quat.dot(cand.quat))))
    const mv = pose.pos.distanceTo(cand.pos) / (Math.max(box.w, box.h, box.d) * Math.max(pose.scale, 1e-6))
    const speed = Math.min(1, ang * 5 + mv * 8)
    const a = 1 - Math.exp(-dt * (SMOOTHING * 0.4 + 50 * speed))
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

  /** Own trackers (red-dot block): found or not, pose in world units, with the same lost-grace rule. */
  function updateDirect(found, pos, quat, label, now) {
    if (found) {
      cand.pos.copy(pos); cand.quat.copy(quat); pose.scale = 1
      if (!tracking) { popT = 0; buzz(10) }
      tracking = true; lastSeen = now
      setStatus(`Tracking · ${label}`, true)
    } else if (tracking && now - lastSeen > LOST_GRACE_MS) {
      tracking = false
      setStatus('Show the block: all 4 red dots of one face')
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
  return {updateTargets, updateDirect, setPose, setBox, setStatus, tick, setMaterial, setSelected, setOverlay, toast, root,
    scrubStart, scrubSet, scrubEnd, prewarm, get scrubbing() { return !!scrub },
    labels: lib.map(m => m.label), get current() { return current }, get selected() { return selected },
    get overlay() { return overlay }, get tracking() { return tracking }}
}
