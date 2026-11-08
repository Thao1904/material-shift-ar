// Shared scene parts drawn in BLOCK coordinates: the other people's phones.
// Each phone anchors this frame to the same physical block (same origin corner thanks to
// the black mark), so a partner's phone gizmo floats where that phone really is.
import * as THREE from 'three'

function textSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 320; c.height = 64
  const g = c.getContext('2d')
  g.fillStyle = 'rgba(12,14,15,.78)'; g.beginPath(); g.roundRect(4, 8, 312, 48, 24); g.fill()
  g.strokeStyle = color; g.lineWidth = 4; g.stroke()
  g.fillStyle = '#fff'; g.font = '600 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillText(text, 160, 33)
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({map: tex, depthTest: false, transparent: true, toneMapped: false}))
  s.scale.set(10, 2, 1); s.renderOrder = 10
  return s
}

function makePhoneGizmo(color) {
  const g = new THREE.Group()
  const col = new THREE.Color(color)
  const body = new THREE.Mesh(new THREE.BoxGeometry(7.1, 14.6, 0.8), new THREE.MeshStandardMaterial({color: 0x1b1d20, roughness: 0.3, metalness: 0.4}))
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 14), new THREE.MeshBasicMaterial({color: col, transparent: true, opacity: 0.85, toneMapped: false}))
  screen.position.z = 0.41                       // screen faces the person; the camera looks down -Z
  g.add(body, screen)
  const L = 16, w = 6, h = 10
  const pts = [[0, 0, 0], [-w, h, -L], [0, 0, 0], [w, h, -L], [0, 0, 0], [w, -h, -L], [0, 0, 0], [-w, -h, -L],
    [-w, h, -L], [w, h, -L], [w, h, -L], [w, -h, -L], [w, -h, -L], [-w, -h, -L], [-w, -h, -L], [-w, h, -L]].map(p => new THREE.Vector3(...p))
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color: col, transparent: true, opacity: 0.7})))
  return g
}

export function createCommonLayer({scene, camera, ctrl}) {
  const frame = new THREE.Group()                // follows the tracked block (no pop scale)
  frame.visible = false
  scene.add(frame)
  const gizmos = new Map()                       // id -> {g, label, key}
  let peersRef = new Map(), labels = []

  function setPeers(map, materialLabels) {
    peersRef = map; labels = materialLabels
    for (const [id, o] of gizmos) if (!map.has(id)) { frame.remove(o.g); gizmos.delete(id) }
    for (const [id, p] of map) {
      let o = gizmos.get(id)
      if (!o) { o = {g: makePhoneGizmo(p.color), label: null, key: ''}; o.g.visible = false; gizmos.set(id, o); frame.add(o.g) }
      const key = `${p.name} · ${labels[p.material] || ''}`
      if (key !== o.key) {
        if (o.label) o.g.remove(o.label)
        o.label = textSprite(key, p.color); o.label.position.y = 10.5; o.g.add(o.label); o.key = key
      }
    }
  }

  const _q = new THREE.Quaternion(), _v = new THREE.Vector3()
  /** This phone's camera pose in block coordinates (sent to the others). */
  function cameraInBlock() {
    _q.copy(frame.quaternion).invert()
    _v.copy(camera.position).sub(frame.position).applyQuaternion(_q)
    const q = _q.clone().multiply(camera.quaternion)
    return {p: [_v.x, _v.y, _v.z], q: [q.x, q.y, q.z, q.w]}
  }

  function update(aligned) {
    frame.position.copy(ctrl.root.position)
    frame.quaternion.copy(ctrl.root.quaternion)
    frame.visible = ctrl.tracking && aligned
    const now = Date.now()
    for (const [id, o] of gizmos) {
      const p = peersRef.get(id)
      const fresh = p && p.p && now - (p.poseAt || 0) < 2500
      o.g.visible = !!fresh
      if (!fresh) { o.init = false; continue }
      o.g.position.lerp(_v.set(...p.p), o.init ? 0.3 : 1)
      o.g.quaternion.slerp(_q.set(...p.q), o.init ? 0.3 : 1)
      o.init = true
    }
  }

  return {setPeers, update, cameraInBlock}
}
