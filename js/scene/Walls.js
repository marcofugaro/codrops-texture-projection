import * as THREE from 'three'
import assets from '../lib/AssetManager'

// TODO make this responsive
const PLANE_WIDTH = 21

// TODO do this in glsl instead
const blueGradient = assets.queue({
  url: 'images/blueGradient.png',
  type: 'texture',
})

export class Walls extends THREE.Group {
  constructor(webgl, options) {
    super(options)
    this.webgl = webgl

    const geometry = new THREE.CylinderGeometry(4, 4, 2, 64)
    const material = new THREE.MeshLambertMaterial({
      // TODO put this in a constant or something
      color: '#5fb8d5',
    })
    const cylinder = new THREE.Mesh(geometry, material)
    cylinder.position.y = -3
    cylinder.position.z = -4
    cylinder.receiveShadow = true
    this.add(cylinder)

    const geometry2 = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_WIDTH)
    const material2 = new THREE.MeshLambertMaterial({
      map: assets.get(blueGradient),
    })
    const wall = new THREE.Mesh(geometry2, material2)
    wall.position.z = -8
    wall.rotateZ(Math.PI)
    this.add(wall)
  }
}
