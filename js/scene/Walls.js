import * as THREE from 'three'
import assets from '../lib/AssetManager'

// TODO make this responsive
const PLANE_WIDTH = 21

// TODO do this on glsl instead
// preload the first texture
const prova = assets.queue({
  url: 'images/prova4.png',
  type: 'texture',
})

// preload the first texture
const provaUp = assets.queue({
  url: 'images/prova4up.png',
  type: 'texture',
})

export class Walls extends THREE.Group {
  constructor(webgl, options) {
    super(options)
    this.webgl = webgl

    const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_WIDTH).rotateX(-Math.PI / 2)
    const material = new THREE.MeshLambertMaterial({
      map: assets.get(provaUp),
    })
    const ground = new THREE.Mesh(geometry, material)
    ground.position.y = -3
    ground.position.z = -5
    ground.receiveShadow = true

    this.add(ground)

    const geometry2 = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_WIDTH)
    const material2 = new THREE.MeshLambertMaterial({
      map: assets.get(prova),
    })
    const wall = new THREE.Mesh(geometry2, material2)
    wall.position.z = -8
    wall.rotateZ(Math.PI)
    this.add(wall)
  }
}
