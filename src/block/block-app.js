// Material Shift for the white wooden block with 4 red dots on each face.
// Camera (getUserMedia) -> red-dot tracker (dots-core.js) -> three.js materials.
import * as THREE from 'three'
import {createMaterialShift} from '../material-shift.js'
import {trackFrame, makeModels, intrinsics} from './dots-core.js'
import {DEFAULT_BLOCK} from './config.js'

const $ = id => document.getElementById(id)
const STORE = 'material-shift-block-v1'
let PROC_LONG = 720            // processing resolution (longer side, px); drops to 560 on slow phones

// ---------- block measurements (saved on this phone) ----------
function loadCfg() {
  try { return {...DEFAULT_BLOCK, ...JSON.parse(localStorage.getItem(STORE) || '{}')} } catch (e) { return {...DEFAULT_BLOCK} }
}
function saveCfg() { try { localStorage.setItem(STORE, JSON.stringify(cfg)) } catch (e) { /* storage blocked */ } }
let cfg = loadCfg()
let models = makeModels(cfg)

// ---------- three.js ----------
const video = $('video'), gl = $('gl'), dbg = $('dbg'), dctx = dbg.getContext('2d')
const renderer = new THREE.WebGLRenderer({canvas: gl, antialias: true, alpha: true})
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera()        // stays at the origin; projection comes from the camera intrinsics
const ctrl = createMaterialShift({scene, camera, renderer, canvas: gl, box: {w: cfg.W, h: cfg.T, d: cfg.D}, sweepAxis: 'x'})
ctrl.setStatus('Tap Start camera')

// ---------- processing canvas ----------
const proc = document.createElement('canvas')
const pctx = proc.getContext('2d', {willReadFrequently: true})
let pw = 0, ph = 0, K = null, view = {sc: 1, ox: 0, oy: 0}

function layout() {
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw) return
  const s = PROC_LONG / Math.max(vw, vh)
  pw = Math.round(vw * s); ph = Math.round(vh * s)
  proc.width = pw; proc.height = ph
  K = intrinsics(pw, ph, cfg.fov)
  const sw = innerWidth, sh = innerHeight
  renderer.setSize(sw, sh, false)
  dbg.width = sw * devicePixelRatio; dbg.height = sh * devicePixelRatio
  // the <video> uses object-fit: cover; mirror that crop in the 3D projection
  const sc = Math.max(sw / pw, sh / ph), visW = sw / sc, visH = sh / sc
  const ox = (pw - visW) / 2, oy = (ph - visH) / 2
  view = {sc, ox, oy}
  const n = 0.5, f = 1000
  camera.projectionMatrix.makePerspective(
    -(K.cx - ox) / K.fx * n, (ox + visW - K.cx) / K.fx * n,
    (K.cy - oy) / K.fy * n, -(oy + visH - K.cy) / K.fy * n, n, f)
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}
addEventListener('resize', layout)

// ---------- frame loop ----------
const FLIP = new THREE.Quaternion(1, 0, 0, 0)      // OpenCV camera (y down, z forward) -> three.js camera
const pos = new THREE.Vector3(), quat = new THREE.Quaternion()
let prevQuat = null, last = null, frames = 0, fps = 0, fpsT = performance.now(), cost = 15

function loop() {
  requestAnimationFrame(loop)
  const now = performance.now()
  if (video.readyState >= 2 && K) {
    pctx.drawImage(video, 0, 0, pw, ph)
    const img = pctx.getImageData(0, 0, pw, ph)
    const t0 = performance.now()
    const r = trackFrame(img.data, pw, ph, K, models, prevQuat)
    cost = cost * 0.9 + (performance.now() - t0) * 0.1
    if (cost > 30 && PROC_LONG > 560) { PROC_LONG = 560; layout() }
    else if (cost < 12 && PROC_LONG < 720) { PROC_LONG = 720; layout() }
    last = r
    if (r.found) {
      prevQuat = r.quat
      pos.set(r.center[0], -r.center[1], -r.center[2])
      quat.set(...r.quat)
      quat.premultiply(FLIP)
      ctrl.updateDirect(true, pos, quat, r.model.label, now)
    } else {
      ctrl.updateDirect(false, null, null, '', now)
    }
    // simple exposure estimate from the frame brightness, -1..1
    let sum = 0, n = 0
    for (let i = 0; i < img.data.length; i += 4 * 97) { sum += img.data[i] * 0.3 + img.data[i + 1] * 0.59 + img.data[i + 2] * 0.11; n++ }
    ctrl.tick({exposure: Math.max(-1, Math.min(1, (sum / n / 255 - 0.5) * 2))})
    frames++
    if (now - fpsT > 1000) { fps = frames; frames = 0; fpsT = now }
  } else {
    ctrl.tick()
  }
  renderer.render(scene, camera)
  drawDebug()
}

function drawDebug() {
  const on = $('debugBtn').getAttribute('aria-pressed') === 'true'
  dctx.setTransform(1, 0, 0, 1, 0, 0)
  dctx.clearRect(0, 0, dbg.width, dbg.height)
  if (!on || !last) return
  const d = devicePixelRatio, S = (x, y) => [((x - view.ox) * view.sc) * d, ((y - view.oy) * view.sc) * d]
  dctx.lineWidth = 2 * d
  dctx.strokeStyle = '#00e5ff'
  for (const b of last.blobs || []) { const [x, y] = S(b.x, b.y); dctx.beginPath(); dctx.arc(x, y, 9 * d, 0, 7); dctx.stroke() }
  if (last.found) {
    dctx.strokeStyle = '#00ff78'; dctx.lineWidth = 3 * d; dctx.beginPath()
    last.quad.forEach((p, i) => { const [x, y] = S(p.x, p.y); i ? dctx.lineTo(x, y) : dctx.moveTo(x, y) })
    dctx.closePath(); dctx.stroke()
  }
  dctx.fillStyle = '#fff'; dctx.font = `${13 * d}px ui-monospace, monospace`
  const info = last.found ? `${last.model.name}  err ${last.err.toFixed(3)}  ${Math.hypot(...last.center).toFixed(1)} cm` : 'no face'
  dctx.fillText(`${info}  ·  red blobs ${(last.blobs || []).length}  ·  ${fps} fps  ·  ${pw}x${ph}`, 12 * d, (innerHeight - 150) * d)
}

// ---------- start camera ----------
$('startBtn').onclick = async () => {
  $('startErr').textContent = ''
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}, height: {ideal: 720}},
    })
    video.srcObject = stream
    await video.play()
    await new Promise(res => (video.videoWidth ? res() : video.addEventListener('loadedmetadata', res, {once: true})))
    layout()
    $('start').hidden = true
    $('hud').hidden = false
    ctrl.setStatus('Show the block: all 4 red dots of one face')
  } catch (e) {
    $('startErr').textContent = e && e.name === 'NotAllowedError'
      ? 'Camera permission was denied. Allow camera access for this site in Settings, then reload.'
      : `Could not open the camera (${(e && e.name) || e}). This page needs HTTPS and a phone camera.`
  }
}

// ---------- calibration panel ----------
const FIELDS = [
  ['W', 'Width (cm)', 'long edge of the side faces'],
  ['D', 'Depth (cm)', 'other edge of the big face'],
  ['T', 'Thickness (cm)', ''],
  ['topInset', 'Big face: dot to edge (cm)', 'center of a dot to the nearest edge'],
  ['sideInsetX', 'Side face: dot to short edge (cm)', ''],
  ['sideInsetY', 'Side face: dot to long edge (cm)', ''],
  ['fov', 'Camera FOV (°)', 'raise if the overlay looks too big, lower if too small'],
]
function buildCalib() {
  const box = $('calibFields')
  box.innerHTML = ''
  for (const [k, label, hint] of FIELDS) {
    const row = document.createElement('label'); row.className = 'field'; row.htmlFor = `cal-${k}`
    row.innerHTML = `<span>${label}${hint ? `<small>${hint}</small>` : ''}</span>`
    const inp = document.createElement('input')
    inp.type = 'number'; inp.id = `cal-${k}`; inp.step = k === 'fov' ? '1' : '0.1'; inp.inputMode = 'decimal'; inp.value = cfg[k]
    inp.oninput = () => {
      const v = parseFloat(inp.value)
      if (!isFinite(v) || v <= 0) return
      cfg[k] = v; saveCfg()
      models = makeModels(cfg)
      ctrl.setBox({w: cfg.W, h: cfg.T, d: cfg.D})
      layout()
    }
    row.appendChild(inp); box.appendChild(row)
  }
}
$('calibBtn').onclick = () => { $('calib').hidden = !$('calib').hidden }
$('calibClose').onclick = () => { $('calib').hidden = true }
$('calibReset').onclick = () => {
  cfg = {...DEFAULT_BLOCK}; saveCfg(); models = makeModels(cfg)
  ctrl.setBox({w: cfg.W, h: cfg.T, d: cfg.D}); layout(); buildCalib()
}
buildCalib()
requestAnimationFrame(loop)
