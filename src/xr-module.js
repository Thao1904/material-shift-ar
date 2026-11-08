// 8th Wall camera pipeline module: listens to image target events and feeds them to Material Shift.
import * as THREE from 'three'
import {createMaterialShift} from './material-shift.js'

export const materialShiftPipelineModule = () => {
  let ctrl = null
  const poses = new Map()   // targetName -> {pos, quat, scale, visible}

  const onImage = ({detail}) => {
    let p = poses.get(detail.name)
    if (!p) { p = {pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1, visible: false}; poses.set(detail.name, p) }
    p.pos.set(detail.position.x, detail.position.y, detail.position.z)
    p.quat.set(detail.rotation.x, detail.rotation.y, detail.rotation.z, detail.rotation.w)
    p.scale = detail.scale
    p.visible = true
  }
  const onLost = ({detail}) => {
    const p = poses.get(detail.name)
    if (p) p.visible = false
  }

  return {
    name: 'material-shift',
    onStart: ({canvas}) => {
      const {scene, camera, renderer} = XR8.Threejs.xrScene()
      ctrl = createMaterialShift({scene, camera, renderer, canvas})
      canvas.addEventListener('touchmove', e => e.preventDefault())
      XR8.XrController.updateCameraProjectionMatrix({origin: camera.position, facing: camera.quaternion})
      document.getElementById('hud').hidden = false
    },
    onUpdate: ({processCpuResult}) => {
      if (!ctrl) return
      ctrl.updateTargets(poses, performance.now())
      ctrl.tick(processCpuResult && processCpuResult.reality && processCpuResult.reality.lighting)
    },
    listeners: [
      {event: 'reality.imagefound', process: onImage},
      {event: 'reality.imageupdated', process: onImage},
      {event: 'reality.imagelost', process: onLost},
    ],
  }
}
