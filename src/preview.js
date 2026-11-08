// Desktop preview (open the site with ?preview): no camera, the cube sits on a desk.
// Drag to orbit, tap the material chips, press ↑ ↓ ← → to tip the cube.
import * as THREE from 'three'
import {OrbitControls} from 'three/addons/controls/OrbitControls.js'
import {createMaterialShift} from './material-shift.js'

export function startPreview() {
  document.body.classList.add('preview')
  const canvas = document.getElementById('camerafeed')
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true})
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x2b2622)
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 50)
  camera.position.set(1.55, 1.35, 2.25)
  scene.add(camera)

  const desk = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.MeshStandardMaterial({color: 0x6b5443, roughness: 0.85}))
  desk.rotation.x = -Math.PI / 2
  desk.receiveShadow = true
  scene.add(desk)
  const sun = new THREE.DirectionalLight(0xffffff, 1.4)
  sun.position.set(-2, 4, 2); sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 6
  scene.add(sun)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, 0.5, 0)
  controls.enableDamping = true
  controls.minDistance = 1.6; controls.maxDistance = 5; controls.maxPolarAngle = 1.45

  const ctrl = createMaterialShift({scene, camera, renderer, canvas, holdToCompare: false})
  const status = document.getElementById('status')
  status.classList.add('ok')
  status.querySelector('span').textContent = 'Desktop preview · no camera'
  const pos = new THREE.Vector3(0, 0.515, 0)
  const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.35, 0))
  let tip = null
  const tipBy = (axis, angle) => {
    if (tip) return
    const from = quat.clone(), to = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(quat)
    tip = {from, to, t0: performance.now()}
  }
  addEventListener('keydown', (e) => {
    const m = {ArrowUp: [new THREE.Vector3(1, 0, 0), -Math.PI / 2], ArrowDown: [new THREE.Vector3(1, 0, 0), Math.PI / 2],
      ArrowLeft: [new THREE.Vector3(0, 0, 1), Math.PI / 2], ArrowRight: [new THREE.Vector3(0, 0, 1), -Math.PI / 2]}[e.key]
    if (m) { e.preventDefault(); tipBy(...m) }
  })
  document.getElementById('tipKeys')?.querySelectorAll('[data-tip]').forEach((b) => {
    b.onclick = () => tipBy(new THREE.Vector3(1, 0, 0), b.dataset.tip === 'fwd' ? -Math.PI / 2 : Math.PI / 2)
  })

  function resize() {
    const w = innerWidth, h = innerHeight
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  addEventListener('resize', resize); resize()
  document.getElementById('hud').hidden = false

  renderer.setAnimationLoop(() => {
    if (tip) {
      const k = Math.min(1, (performance.now() - tip.t0) / 600), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      quat.slerpQuaternions(tip.from, tip.to, e)
      pos.y = 0.515 + Math.sin(Math.PI * k) * 0.25
      if (k >= 1) tip = null
    }
    ctrl.setPose(pos, quat, 1)
    ctrl.tick()
    controls.update()
    renderer.render(scene, camera)
  })
  window.__materialShift = ctrl
}
