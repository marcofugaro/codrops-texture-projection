import * as THREE from 'three'

// TODO make this responsive
const PLANE_WIDTH = 20

export class Walls extends THREE.Group {
  constructor(webgl, options) {
    super(options)
    this.webgl = webgl

    const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_WIDTH).rotateX(-Math.PI / 2)
    const material = new THREE.MeshLambertMaterial({
      color: webgl.controls.background,
    })
    const ground = new THREE.Mesh(geometry, material)
    ground.position.y = -2
    ground.receiveShadow = true
    this.add(ground)

    const geometry2 = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_WIDTH)
    const material2 = new THREE.MeshLambertMaterial({
      color: webgl.controls.background,
    })
    const wall = new THREE.Mesh(geometry2, material2)
    wall.position.z = -3
    this.add(wall)
  }
}
