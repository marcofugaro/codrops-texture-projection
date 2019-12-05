import * as THREE from 'three'

export class ForegroundSphere extends THREE.Group {
  constructor(webgl, options) {
    super(options)
    this.webgl = webgl
    this.options = options

    const geometry = new THREE.SphereGeometry(6, 64, 64)
    const material = new THREE.MeshLambertMaterial({
      color: webgl.controls.foreground,
    })
    webgl.controls.$onChanges(({ foreground }) => {
      if (foreground) {
        material.color = new THREE.Color(foreground.value)
      }
    })
    const sphere = new THREE.Mesh(geometry, material)
    sphere.position.y = -7.5
    sphere.position.z = -6
    sphere.receiveShadow = true
    this.add(sphere)
  }
}
