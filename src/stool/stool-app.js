// Stool fabric recolor: the 8 lime stickers on the seat place a 3D model of the
// SONGMICS ottoman over the real one; swipe through fabric colors, pick linen/velvet/leather.
import * as THREE from 'three'
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js'
import {intrinsics, fovFromSquare} from '../block/dots-core.js'
import {trackStool} from './stool-core.js'
import {DEFAULT_STOOL} from './config.js'
import {makeStool, makeFabric, swatchCanvas, FABRIC_COLORS, FABRIC_TYPES} from './stool-model.js'

const $ = id => document.getElementById(id)
const STORE = 'material-shift-stool-v1'
let PROC_LONG = 720

function loadCfg() {
  let c = {...DEFAULT_STOOL}
  try {
    const block = JSON.parse(localStorage.getItem('material-shift-block-v2') || '{}')
    if (block.fovCalibrated && block.fov) c.fov = block.fov
    c = {...c, ...JSON.parse(localStorage.getItem(STORE) || '{}')}
  } catch (e) { /* storage blocked */ }
  return c
}
function saveCfg() { try { localStorage.setItem(STORE, JSON.stringify(cfg)) } catch (e) { /* storage blocked */ } }
let cfg = loadCfg()

// ---------- three.js ----------
const video = $('video'), gl = $('gl'), dbg = $('dbg'), dctx = dbg.getContext('2d'), bg = $('bg'), bgctx = bg.getContext('2d')
const renderer = new THREE.WebGLRenderer({canvas: gl, antialias: true, alpha: true})
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.localClippingEnabled = true
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
const hemi = new THREE.HemisphereLight(0xfff6ea, 0x3a342e, 0.45)
scene.add(hemi)

// stool frame follows the tracked seat; the key light and the floor shadow ride with it
const frame = new THREE.Group(); frame.visible = false; scene.add(frame)
const key = new THREE.DirectionalLight(0xffffff, 1.8)
key.position.set(-35, 110, 45); key.castShadow = true
key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 8; key.shadow.bias = -0.0008
Object.assign(key.shadow.camera, {left: -45, right: 45, top: 45, bottom: -45, near: 20, far: 220})
key.target.position.set(0, -cfg.H / 2, 0)
frame.add(key, key.target)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.ShadowMaterial({opacity: 0.38}))
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true
frame.add(floor)

// fabrics: plain + clipped variants for the swipe split, cached per color/type
const planeIn = new THREE.Plane(), planeOut = new THREE.Plane()
const fabrics = new Map()
function fabric(ci, ti) {
  const k = `${ci}/${ti}`
  if (!fabrics.has(k)) {
    const plain = makeFabric(FABRIC_COLORS[ci].hex, FABRIC_TYPES[ti].key)
    const clipIn = plain.clone(); clipIn.clippingPlanes = [planeIn]
    const clipOut = plain.clone(); clipOut.clippingPlanes = [planeOut]
    fabrics.set(k, {plain, clipIn, clipOut})
  }
  return fabrics.get(k)
}
const legMat = new THREE.MeshStandardMaterial({color: 0x161616, roughness: 0.5})
let colorI = 0, typeI = 0, stoolA = null, stoolB = null
function buildStools() {
  for (const s of [stoolA, stoolB]) if (s) frame.remove(s)
  stoolA = makeStool(cfg, fabric(colorI, typeI).plain, legMat)
  stoolB = makeStool(cfg, fabric(colorI, typeI).clipIn, legMat)
  stoolB.traverse(m => { if (m.userData.leg) m.visible = false }); stoolB.visible = false
  floor.position.y = -cfg.H; key.target.position.set(0, -cfg.H / 2, 0)
  frame.add(stoolA, stoolB)
}
buildStools()
const setFabric = (stool, mat) => stool.traverse(m => { if (m.userData.fabric) m.material = mat })

function setStatus(text, ok) { const el = $('status'); el.querySelector('span').textContent = text; el.classList.toggle('ok', !!ok) }
let toastT
function toast(t) { const el = $('matname'); el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1000) }
const label = (ci = colorI, ti = typeI) => `${FABRIC_COLORS[ci].label} ${FABRIC_TYPES[ti].label.toLowerCase()}`

// ---------- camera + projection ----------
const proc = document.createElement('canvas'), pctx = proc.getContext('2d', {willReadFrequently: true})
let pw = 0, ph = 0, K = null, view = {sc: 1, ox: 0, oy: 0}
function layout() {
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw) return
  const s = PROC_LONG / Math.max(vw, vh)
  pw = Math.round(vw * s); ph = Math.round(vh * s); proc.width = pw; proc.height = ph
  K = intrinsics(pw, ph, cfg.fov)
  const sw = innerWidth, sh = innerHeight
  renderer.setSize(sw, sh, false)
  bg.width = Math.round(sw * devicePixelRatio); bg.height = Math.round(sh * devicePixelRatio)
  dbg.width = sw * devicePixelRatio; dbg.height = sh * devicePixelRatio
  const sc = Math.max(sw / pw, sh / ph), visW = sw / sc, visH = sh / sc, ox = (pw - visW) / 2, oy = (ph - visH) / 2
  view = {sc, ox, oy}
  const n = 1, f = 2000
  camera.projectionMatrix.makePerspective(-(K.cx - ox) / K.fx * n, (ox + visW - K.cx) / K.fx * n, (K.cy - oy) / K.fy * n, -(oy + visH - K.cy) / K.fy * n, n, f)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}
addEventListener('resize', layout)
function drawBackground() {
  const vw = video.videoWidth, vh = video.videoHeight, W = bg.width, H = bg.height
  const s = Math.max(W / vw, H / vh), sw = W / s, sh = H / s
  bgctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H)
}

// ---------- FOV self-calibration from the seat rectangle ----------
let fovSamples = []
function feedFov(r) {
  if (cfg.fovManual || r.err > 0.08) return
  const a = cfg.W / 2 - cfg.inset, b = cfg.D / 2 - cfg.inset
  for (const e of fovFromSquare(r.quad, pw, ph, [[-a, -b], [a, -b], [a, b], [-a, b]])) if (e.w > 0.1) fovSamples.push(e)
  if (fovSamples.length > 120) fovSamples.splice(0, fovSamples.length - 120)
  if (fovSamples.length < 30) return
  const sorted = fovSamples.slice().sort((p, q) => p.fov - q.fov), total = sorted.reduce((s, e) => s + e.w, 0)
  let acc = 0, med = sorted[0].fov
  for (const e of sorted) { acc += e.w; if (acc >= total / 2) { med = e.fov; break } }
  if (Math.abs(med - cfg.fov) > 0.6) { cfg.fov = Math.round(med * 10) / 10; saveCfg(); layout(); const i = $('cal-fov'); if (i) i.value = cfg.fov }
}

// ---------- loop ----------
const FLIP = new THREE.Quaternion(1, 0, 0, 0), RY180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
const pose = {pos: new THREE.Vector3(), quat: new THREE.Quaternion()}, tPos = new THREE.Vector3(), tQuat = new THREE.Quaternion(), alt = new THREE.Quaternion()
let prevQuat = null, last = null, lastSeen = -1e9, tracking = false, fresh = true, comparing = false
let frames = 0, fps = 0, fpsT = performance.now(), cost = 15, lastT = performance.now()
function loop() {
  requestAnimationFrame(loop)
  const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000); lastT = now
  if (video.readyState >= 2 && K) {
    pctx.drawImage(video, 0, 0, pw, ph)
    drawBackground()
    const img = pctx.getImageData(0, 0, pw, ph)
    const t0 = performance.now()
    const r = trackStool(img.data, pw, ph, K, cfg, prevQuat)
    cost = cost * 0.9 + (performance.now() - t0) * 0.1
    if (cost > 35 && PROC_LONG > 560) { PROC_LONG = 560; layout() } else if (cost < 14 && PROC_LONG < 720) { PROC_LONG = 720; layout() }
    last = r
    if (r.found) {
      prevQuat = r.quat
      feedFov(r)
      tPos.set(r.center[0], -r.center[1], -r.center[2])
      tQuat.set(...r.quat).premultiply(FLIP)
      alt.copy(tQuat).multiply(RY180)                      // the seat looks the same turned 180°: take the closer one
      if (!fresh && Math.abs(alt.dot(pose.quat)) > Math.abs(tQuat.dot(pose.quat))) tQuat.copy(alt)
      if (!tracking) { fresh = true; setStatus('Tracking the stool', true) }
      tracking = true; lastSeen = now
    } else if (tracking && now - lastSeen > 400) { tracking = false; setStatus('Show the stool: the stickers on the seat') }
    let sum = 0, n = 0
    for (let i = 0; i < img.data.length; i += 4 * 97) { sum += img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; n++ }
    const f = THREE.MathUtils.clamp(1 + 0.6 * (sum / n / 255 - 0.5) * 2, 0.4, 1.6)
    key.intensity = 1.8 * f; hemi.intensity = 0.4 * f; scene.environmentIntensity = f
    frames++; if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now }
  }
  if (tracking) {
    if (fresh) { pose.pos.copy(tPos); pose.quat.copy(tQuat); fresh = false }
    else {
      const ang = 2 * Math.acos(Math.min(1, Math.abs(pose.quat.dot(tQuat)))), mv = pose.pos.distanceTo(tPos) / 40
      const a = 1 - Math.exp(-dt * (7 + 50 * Math.min(1, ang * 5 + mv * 8)))
      pose.pos.lerp(tPos, a); pose.quat.slerp(tQuat, a)
    }
    frame.position.copy(pose.pos); frame.quaternion.copy(pose.quat)
  }
  frame.visible = tracking && !comparing
  renderer.render(scene, camera)
  drawDebug()
}

function drawDebug() {
  dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, dbg.width, dbg.height)
  if ($('debugBtn').getAttribute('aria-pressed') !== 'true' || !last) return
  const d = devicePixelRatio, S = (x, y) => [((x - view.ox) * view.sc) * d, ((y - view.oy) * view.sc) * d]
  dctx.lineWidth = 2 * d; dctx.strokeStyle = '#00e5ff'
  for (const b of last.blobs) { const [x, y] = S(b.x, b.y); dctx.beginPath(); dctx.arc(x, y, 10 * d, 0, 7); dctx.stroke() }
  if (last.found) {
    dctx.strokeStyle = '#00ff78'; dctx.lineWidth = 3 * d; dctx.beginPath()
    last.quad.forEach((p, i) => { const [x, y] = S(p.x, p.y); i ? dctx.lineTo(x, y) : dctx.moveTo(x, y) }); dctx.closePath(); dctx.stroke()
  }
  dctx.fillStyle = '#fff'; dctx.font = `${13 * d}px ui-monospace, monospace`
  const info = last.found ? `${last.hits}/8 stickers · err ${last.err.toFixed(3)} · rms ${(last.rms || 0).toFixed(1)}px · ${Math.hypot(...last.center).toFixed(0)} cm` : 'no stool'
  dctx.fillText(`${info} · FOV ${cfg.fov}° · ${fps} fps`, 12 * d, (innerHeight - 190) * d)
}

// ---------- start ----------
$('startBtn').onclick = async () => {
  $('startErr').textContent = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio: false, video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}}})
    video.srcObject = stream
    await video.play()
    await new Promise(res => (video.videoWidth ? res() : video.addEventListener('loadedmetadata', res, {once: true})))
    layout()
    $('start').hidden = true; $('hud').hidden = false
    setStatus('Show the stool: the stickers on the seat')
  } catch (e) {
    $('startErr').textContent = e && e.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access for this site in Settings, then reload.'
      : `Could not open the camera (${(e && e.name) || e}). This page needs HTTPS and a phone camera.`
  }
}

// ---------- swipe split between fabrics ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3()
function splitAt(x, side) {
  const w = innerWidth, nx = (x / w) * 2 - 1, cam = camera.position
  _a.set(nx, 1, 0.5).unproject(camera).sub(cam); _b.set(nx, -1, 0.5).unproject(camera).sub(cam)
  _n.crossVectors(_a, _b).normalize()
  _t.set(Math.min(1, nx + 0.3), 0, 0.5).unproject(camera).sub(cam)
  if (_n.dot(_t) < 0) _n.negate()
  planeIn.setFromNormalAndCoplanarPoint(_n, cam); planeOut.copy(planeIn).negate()
  if (side === 'left') { planeIn.negate(); planeOut.negate() }
}
let scrub = null
function scrubStart(ci, ti, side) {
  scrub = {ci, ti, side}
  setFabric(stoolA, fabric(colorI, typeI).clipOut)
  setFabric(stoolB, fabric(ci, ti).clipIn); stoolB.visible = true
}
function scrubEnd(commit) {
  if (!scrub) return
  if (commit) { colorI = scrub.ci; typeI = scrub.ti }
  scrub = null
  setFabric(stoolA, fabric(colorI, typeI).plain); stoolB.visible = false
  syncUI()
}
/** Animated change (chips / fabric buttons): the split line sweeps across by itself. */
let anim = false
function sweepTo(ci, ti) {
  if (anim || (ci === colorI && ti === typeI)) return
  anim = true
  scrubStart(ci, ti, 'right')
  const w = innerWidth, t0 = performance.now(), line = $('swipeLine')
  line.hidden = false
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 520), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, x = w * (1 - e)
    splitAt(x, 'right'); line.style.transform = `translateX(${x}px)`
    if (k < 1) return requestAnimationFrame(step)
    scrubEnd(true); line.hidden = true; anim = false; toast(label())
  }
  requestAnimationFrame(step)
}

// ---------- UI: color chips + fabric switch ----------
function syncUI() {
  FABRIC_COLORS.forEach((c, i) => $(`col-${c.key}`)?.setAttribute('aria-pressed', i === colorI))
  FABRIC_TYPES.forEach((t, i) => $(`fab-${t.key}`)?.setAttribute('aria-pressed', i === typeI))
}
FABRIC_COLORS.forEach((c, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.id = `col-${c.key}`
  b.append(swatchCanvas(c.hex), document.createTextNode(c.label))
  b.onclick = () => sweepTo(i, typeI)
  $('chips').appendChild(b)
})
FABRIC_TYPES.forEach((t, i) => {
  const b = document.createElement('button'); b.type = 'button'; b.id = `fab-${t.key}`; b.textContent = t.label
  b.onclick = () => sweepTo(colorI, i)
  $('fabricSeg').appendChild(b)
})
syncUI()

// ---------- gestures: swipe = next/previous color, hold = real stool ----------
const line = $('swipeLine'), slabel = $('swipeLabel')
let g = null, holdT = null
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
gl.addEventListener('pointerdown', (e) => {
  if (anim) return
  g = {x0: e.clientX, y0: e.clientY, active: false, hist: [[e.clientX, performance.now()]]}
  clearTimeout(holdT); holdT = setTimeout(() => { if (g && !g.active) { comparing = true; $('compare').classList.add('on') } }, 300)
})
gl.addEventListener('pointermove', (e) => {
  if (!g) return
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0
  g.hist.push([e.clientX, performance.now()]); if (g.hist.length > 6) g.hist.shift()
  if (Math.hypot(dx, dy) > 10) clearTimeout(holdT)
  if (!g.active) {
    if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.2 || !tracking) return
    const dir = dx < 0 ? 1 : -1, n = FABRIC_COLORS.length
    g.active = true; g.dir = dir; g.ci = (colorI + dir + n) % n
    comparing = false; $('compare').classList.remove('on')
    scrubStart(g.ci, typeI, dir === 1 ? 'right' : 'left')
    slabel.textContent = label(g.ci, typeI); slabel.classList.add('on'); line.hidden = false
    try { gl.setPointerCapture(e.pointerId) } catch (err) { /* not supported */ }
  }
  const w = innerWidth
  g.x = g.dir === 1 ? clamp(w + dx, 0, w) : clamp(dx, 0, w)
  splitAt(g.x, g.dir === 1 ? 'right' : 'left'); line.style.transform = `translateX(${g.x}px)`
})
function end() {
  clearTimeout(holdT); comparing = false; $('compare').classList.remove('on')
  if (!g) return
  const s0 = g; g = null
  if (!s0.active) return
  const w = innerWidth, [x1, t1] = s0.hist[0], [x2, t2] = s0.hist[s0.hist.length - 1]
  const v = (x2 - x1) / Math.max(1, t2 - t1), progress = s0.dir === 1 ? (w - s0.x) / w : s0.x / w
  const commit = progress > 0.33 || v * -s0.dir > 0.5
  const from = s0.x, to = commit ? (s0.dir === 1 ? 0 : w) : (s0.dir === 1 ? w : 0), t0 = performance.now(), side = s0.dir === 1 ? 'right' : 'left'
  anim = true
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / 220), x = from + (to - from) * (1 - Math.pow(1 - k, 3))
    splitAt(x, side); line.style.transform = `translateX(${x}px)`
    if (k < 1) return requestAnimationFrame(step)
    scrubEnd(commit); line.hidden = true; slabel.classList.remove('on'); anim = false
    if (commit) { toast(label()); try { navigator.vibrate && navigator.vibrate(15) } catch (err) { /* no vibration */ } }
  }
  requestAnimationFrame(step)
}
gl.addEventListener('pointerup', end)
gl.addEventListener('pointercancel', end)

// ---------- debug + calibration ----------
$('debugBtn').onclick = () => { const b = $('debugBtn'); b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true') }
const FIELDS = [
  ['W', 'Seat width (cm)', 'long side'], ['D', 'Seat depth (cm)', ''], ['H', 'Height (cm)', 'floor to seat top'],
  ['lidT', 'Lid thickness (cm)', ''], ['legH', 'Leg height (cm)', ''],
  ['inset', 'Stickers: distance from edge (cm)', 'center of a sticker to the seat edge'],
  ['fov', 'Camera FOV (°)', 'measured automatically while you move around'],
]
function buildCalib() {
  const box = $('calibFields'); box.innerHTML = ''
  for (const [k, lab, hint] of FIELDS) {
    const row = document.createElement('label'); row.className = 'field'; row.htmlFor = `cal-${k}`
    row.innerHTML = `<span>${lab}${hint ? `<small>${hint}</small>` : ''}</span>`
    const inp = document.createElement('input')
    inp.type = 'number'; inp.id = `cal-${k}`; inp.step = k === 'fov' ? '1' : '0.1'; inp.inputMode = 'decimal'; inp.value = cfg[k]
    inp.oninput = () => {
      const v = parseFloat(inp.value); if (!isFinite(v) || v <= 0) return
      cfg[k] = v; if (k === 'fov') cfg.fovManual = true
      saveCfg(); layout(); if (k !== 'fov' && k !== 'inset') buildStools()
    }
    row.appendChild(inp); box.appendChild(row)
  }
}
$('calibBtn').onclick = () => { $('calib').hidden = !$('calib').hidden }
$('calibClose').onclick = () => { $('calib').hidden = true }
$('calibReset').onclick = () => { cfg = {...DEFAULT_STOOL}; saveCfg(); fovSamples = []; layout(); buildStools(); buildCalib() }
buildCalib()
window.__stool = {get color() { return colorI }, get type() { return typeI }, get tracking() { return tracking }}
requestAnimationFrame(loop)
