import * as THREE from 'three'

export function addLights(webgl, options = {}) {
  const { position = new THREE.Vector3(0, 10, 10) } = options

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
  directionalLight.position.copy(position)

  webgl.scene.add(directionalLight)

  const ambientLight = new THREE.AmbientLight(0xcccccc, 0.9)
  webgl.scene.add(ambientLight)
}
