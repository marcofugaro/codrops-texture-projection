import * as THREE from 'three'

export class ForegroundCylinder extends THREE.Group {
  constructor(webgl, options) {
    super(options)
    this.webgl = webgl
    this.options = options

    const geometry = new THREE.CylinderGeometry(4, 4, 2, 64)
    const material = new THREE.MeshLambertMaterial({
      color: webgl.controls.foreground,
    })
    webgl.controls.$onChanges(({ foreground }) => {
      if (foreground) {
        material.color = new THREE.Color(foreground.value)
      }
    })
    const cylinder = new THREE.Mesh(geometry, material)
    cylinder.position.y = -3
    cylinder.position.z = -4
    cylinder.receiveShadow = true
    this.add(cylinder)
  }
}
