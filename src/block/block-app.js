// Material Shift for the white wooden block with 4 red dots on each face.
// Camera (getUserMedia) -> red-dot tracker (dots-core.js) -> three.js materials.
import * as THREE from 'three'
import {createMaterialShift} from '../material-shift.js'
import {trackFrame, makeModels, intrinsics} from './dots-core.js'
import {DEFAULT_BLOCK} from './config.js'
import {createRoom, randomCode, DEFAULT_BROKER} from './room.js'
import {createCommonLayer} from './common-layer.js'

const $ = id => document.getElementById(id)
const STORE = 'material-shift-block-v2'
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
// My own material choice (the chips) is separate from what is displayed (mine / partner's / mix).
let myMat = 0, viewMode = 'mine', mixRatio = 0.5
const ctrl = createMaterialShift({scene, camera, renderer, canvas: gl, box: {w: cfg.W, h: cfg.T, d: cfg.D}, sweepAxis: 'x',
  onChip: (i) => {
    myMat = i
    ctrl.setSelected(i)
    if (room.code) room.setMaterial(i)
    refreshDisplay(true)
    renderViews()
  }})
ctrl.setStatus('Tap Start camera')

// ---------- shared room ----------
const params = new URLSearchParams(location.search)
const room = createRoom({
  broker: params.get('broker') || DEFAULT_BROKER,
  onPeers: (map, poseOnly) => {
    layer.setPeers(map, ctrl.labels)
    if (!poseOnly) { refreshDisplay(false); renderRoomInfo(); renderViews() }
  },
  onStatus: (s, code, msg) => { roomStatus = s; renderRoomInfo(msg) },
})
let roomStatus = 'idle'
const layer = createCommonLayer({scene, camera, ctrl})
window.__room = room; window.__ms = ctrl

/** The first other phone in the room (rooms are meant for two people). */
function partner() {
  const ids = [...room.peers.keys()].sort()
  return ids.length ? room.peers.get(ids[0]) : null
}

/**
 * The mixed common layer must look the same on every phone, so it does not depend on who
 * is looking: the two people are ordered by id (first = base, second = patches), and the
 * patch ratio is shared (latest slider change wins).
 */
function mixSetup() {
  const p = partner()
  if (!p) return null
  const a = {id: room.me.id, material: myMat, mix: room.me.mix, mixAt: room.me.mixAt}
  const [first, second] = [a, p].sort((x, y) => (x.id < y.id ? -1 : 1))
  const latest = a.mixAt >= (p.mixAt || 0) ? a : p
  return {base: first.material, over: second.material === first.material ? null : second.material, ratio: latest.mix ?? 0.5}
}

/** What a view looks like: {base, over, ratio}. */
function viewState(mode) {
  const p = partner()
  if (!p || mode === 'mine') return {base: myMat, over: null, ratio: mixRatio}
  if (mode === 'partner') return {base: p.material, over: null, ratio: mixRatio}
  return mixSetup()
}
function viewLabel(mode) {
  const p = partner(), L = ctrl.labels
  if (!p || mode === 'mine') return `Mine · ${L[myMat]}`
  if (mode === 'partner') return `${p.name} · ${L[p.material]}`
  const m = mixSetup()
  return m.over === null ? `Mix · ${L[m.base]}` : `Mix · ${L[m.base]} + ${L[m.over]}`
}

/** Decide what the block shows: my material, my partner's, or both mixed. */
let shown = '', pendingRefresh = false
function refreshDisplay(byMe) {
  if (ctrl.scrubbing) { pendingRefresh = true; return }      // a swipe is in progress: apply afterwards
  const p = partner(), L = ctrl.labels
  const v = viewState(p ? viewMode : 'mine')
  const base = v.base, over = v.over
  if (over !== null) mixRatio = v.ratio
  ctrl.setMaterial(base, true)
  ctrl.setOverlay(over, mixRatio)
  const key = `${base}/${over}`
  if (key !== shown) {
    shown = key
    ctrl.toast(over === null ? L[base] : `${L[base]} + ${L[over]}`)
    if (!byMe && p) try { navigator.vibrate && navigator.vibrate(12) } catch (e) { /* not supported */ }
  }
}
// alignment: the block frame is only trusted after the black origin mark has been seen
let aligned = false, lastFound = -1e9

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
    const r = trackFrame(img.data, pw, ph, K, models, prevQuat, 0.15, cfg)
    cost = cost * 0.9 + (performance.now() - t0) * 0.1
    if (cost > 30 && PROC_LONG > 560) { PROC_LONG = 560; layout() }
    else if (cost < 12 && PROC_LONG < 720) { PROC_LONG = 720; layout() }
    last = r
    if (r.found) {
      if (now - lastFound > 1500) aligned = false          // lost for a while: orientation must be re-confirmed
      if (r.markScore > 0.3) aligned = true
      lastFound = now
      prevQuat = r.quat
      pos.set(r.center[0], -r.center[1], -r.center[2])
      quat.set(...r.quat)
      quat.premultiply(FLIP)
      const label = room.code ? `${r.model.label} · ${aligned ? 'aligned' : 'show the black mark'}` : r.model.label
      ctrl.updateDirect(true, pos, quat, label, now)
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
  layer.update(aligned)
  if (room.code && aligned && ctrl.tracking) { const c = layer.cameraInBlock(); room.publishPose(c.p, c.q) }
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
  if (last.found && last.model.name === 'top') {            // where the origin mark is expected
    const a = cfg.W / 2 - cfg.topInset, b = cfg.D / 2 - cfg.topInset
    const v = new THREE.Vector3(-a + cfg.markOffset, cfg.T / 2, -b + cfg.markOffset)
    v.applyQuaternion(quat).add(pos).project(camera)
    const x = (v.x + 1) / 2 * innerWidth * d, y = (1 - v.y) / 2 * innerHeight * d
    dctx.strokeStyle = last.markScore > 0.3 ? '#ffd166' : 'rgba(255,209,102,.45)'; dctx.lineWidth = 2 * d
    dctx.beginPath(); dctx.arc(x, y, 11 * d, 0, 7); dctx.stroke()
  }
  const info = last.found ? `${last.model.name}  err ${last.err.toFixed(3)}  mark ${last.markScore.toFixed(2)}  ${Math.hypot(...last.center).toFixed(1)} cm` : 'no face'
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
    if (params.get('room')) joinRoom(params.get('room'))
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
  ['markOffset', 'Black mark: offset (cm)', 'from its red dot toward the center, along each edge'],
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

// ---------- room panel ----------
function joinRoom(code) {
  room.join(code, myMat)
  const url = new URL(location.href); url.searchParams.set('room', room.code)
  history.replaceState(null, '', url)
  renderRoomInfo(); renderViews()
}
function renderRoomInfo(msg) {
  const peers = room.peers.size
  const pill = $('roomPill')
  if (!room.code) { pill.textContent = 'Room'; $('roomInfo').textContent = 'Not in a room. Create one, or type the code from the other phone.'; $('roomLive').hidden = true; return }
  const st = {connecting: 'connecting…', connected: `${peers + 1} phone${peers ? 's' : ''}`, offline: 'offline, retrying…', error: 'connection error'}[roomStatus] || roomStatus
  pill.textContent = `Room ${room.code} · ${st}`
  $('roomLive').hidden = false
  $('roomCode').textContent = room.code
  const link = new URL(location.href); link.searchParams.set('room', room.code); link.searchParams.delete('broker')
  if (params.get('broker')) link.searchParams.set('broker', params.get('broker'))
  $('roomLink').textContent = link.href
  const L = ctrl.labels
  $('roomInfo').textContent = msg ? `${st} (${msg})` : `You are ${room.me.name}. ${peers ? [...room.peers.values()].map(p => `${p.name} (${L[p.material]})`).join(', ') + ' connected.' : 'Waiting for the other phone…'}`
}
$('roomPill').onclick = () => { $('room').hidden = !$('room').hidden; renderRoomInfo() }
$('roomClose').onclick = () => { $('room').hidden = true }
$('roomCreate').onclick = () => joinRoom(randomCode())
$('roomJoin').onclick = () => { const c = $('roomInput').value.trim(); if (c) joinRoom(c) }
$('roomInput').addEventListener('keydown', e => { if (e.key === 'Enter') $('roomJoin').click() })
$('roomLeave').onclick = () => { room.leave(); viewMode = 'mine'; refreshDisplay(true); renderRoomInfo(); renderViews() }
$('roomCopy').onclick = async () => {
  try { await navigator.clipboard.writeText($('roomLink').textContent); $('roomCopy').textContent = 'Copied' }
  catch (e) { const r = document.createRange(); r.selectNodeContents($('roomLink')); getSelection().removeAllRanges(); getSelection().addRange(r) }
  setTimeout(() => { $('roomCopy').textContent = 'Copy link' }, 1500)
}
// ---------- view switch: Mine / Partner / Mix ----------
function renderViews() {
  const p = partner(), L = ctrl.labels
  $('views').hidden = !p
  if (!p) return
  const seg = $('viewSeg')
  const items = [['mine', `Mine · ${L[myMat]}`], ['mix', 'Mix'], ['partner', `${p.name} · ${L[p.material]}`]]
  seg.innerHTML = ''
  for (const [k, label] of items) {
    const b = document.createElement('button')
    b.type = 'button'; b.id = `view-${k}`; b.textContent = label
    b.setAttribute('aria-pressed', viewMode === k)
    if (k === 'partner') b.style.setProperty('--dot', p.color)
    b.onclick = () => { viewMode = k; refreshDisplay(true); renderViews() }
    seg.appendChild(b)
  }
  $('mixRow').hidden = viewMode !== 'mix'
  // the slider always reads "mine ← → partner" on each phone; the shared ratio is the share of
  // the second (by id) person's material, so phones that are second see it flipped
  const m = mixSetup()
  $('mixA').textContent = L[myMat]; $('mixB').textContent = L[p.material]
  if (document.activeElement !== $('mixRange')) $('mixRange').value = Math.round((iAmFirst() ? m.ratio : 1 - m.ratio) * 100)
}
function iAmFirst() { const p = partner(); return !p || room.me.id < p.id }
let mixSend = null
$('mixRange').addEventListener('input', () => {
  const v = $('mixRange').value / 100
  mixRatio = iAmFirst() ? v : 1 - v
  ctrl.setOverlay(ctrl.overlay, mixRatio)
  room.me.mix = mixRatio; room.me.mixAt = Date.now()
  clearTimeout(mixSend); mixSend = setTimeout(() => room.setMix(mixRatio), 120)    // throttle network updates
})
// ---------- swipe between layers ----------
// Mine ← Mix → Partner (alone: swipe through my materials). A line follows the finger and the
// block shows the next layer on one side of it; release past 1/3 of the screen (or flick) to switch.
const VIEWS = ['mine', 'mix', 'partner']
function swipeTarget(dir) {                    // dir +1 = finger moves left (next), -1 = right (previous)
  const p = partner(), n = ctrl.labels.length
  if (!p) {
    const mat = (myMat + dir + n) % n
    return {state: {base: mat, over: null, ratio: mixRatio}, label: `Mine · ${ctrl.labels[mat]}`, apply: () => chooseMine(mat)}
  }
  const i = VIEWS.indexOf(viewMode) + dir
  if (i < 0 || i >= VIEWS.length) return null
  const mode = VIEWS[i]
  return {state: viewState(mode), label: viewLabel(mode), apply: () => { viewMode = mode; renderViews() }}
}
function chooseMine(mat) { myMat = mat; ctrl.setSelected(mat); if (room.code) room.setMaterial(mat) }

const line = $('swipeLine'), slabel = $('swipeLabel')
let g = null, anim = false
const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
gl.addEventListener('pointerdown', (e) => {
  if (anim) return
  g = {x0: e.clientX, y0: e.clientY, active: false, hist: [[e.clientX, performance.now()]]}
})
gl.addEventListener('pointermove', (e) => {
  if (!g) return
  const dx = e.clientX - g.x0, dy = e.clientY - g.y0
  g.hist.push([e.clientX, performance.now()]); if (g.hist.length > 6) g.hist.shift()
  if (!g.active) {
    if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.2) return
    const dir = dx < 0 ? 1 : -1, target = swipeTarget(dir)
    if (!target || !ctrl.tracking) { g = null; return }
    g.active = true; g.dir = dir; g.target = target
    ctrl.scrubStart(target.state, dir === 1 ? 'right' : 'left')
    slabel.textContent = target.label; slabel.classList.add('on')
    line.hidden = false
    try { gl.setPointerCapture(e.pointerId) } catch (err) { /* not supported */ }
  }
  const w = innerWidth
  g.x = g.dir === 1 ? clamp(w + dx, 0, w) : clamp(dx, 0, w)
  ctrl.scrubSet(g.x)
  line.style.transform = `translateX(${g.x}px)`
})
function endSwipe() {
  if (!g) return
  const s0 = g; g = null
  if (!s0.active) return
  const w = innerWidth
  const [x1, t1] = s0.hist[0], [x2, t2] = s0.hist[s0.hist.length - 1]
  const v = (x2 - x1) / Math.max(1, t2 - t1)                      // px per ms, negative = moving left
  const progress = s0.dir === 1 ? (w - s0.x) / w : s0.x / w
  const commit = progress > 0.33 || v * -s0.dir > 0.5
  const from = s0.x, to = commit ? (s0.dir === 1 ? 0 : w) : (s0.dir === 1 ? w : 0)
  const t0 = performance.now(), dur = 220
  anim = true
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - k, 3)
    const x = from + (to - from) * e
    ctrl.scrubSet(x); line.style.transform = `translateX(${x}px)`
    if (k < 1) return requestAnimationFrame(step)
    ctrl.scrubEnd(commit)
    line.hidden = true; slabel.classList.remove('on'); anim = false
    if (commit) {
      s0.target.apply()
      try { navigator.vibrate && navigator.vibrate(15) } catch (err) { /* not supported */ }
    }
    pendingRefresh = false
    refreshDisplay(true); renderViews()
  }
  requestAnimationFrame(step)
}
gl.addEventListener('pointerup', endSwipe)
gl.addEventListener('pointercancel', endSwipe)

renderRoomInfo()
setTimeout(() => ctrl.prewarm(), 1500)
requestAnimationFrame(loop)
