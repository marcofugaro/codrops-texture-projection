import * as THREE from 'three'

export function addLights(webgl, options = {}) {
  const { position = new THREE.Vector3(0, 10, 10) } = options

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
  directionalLight.position.copy(position)

  webgl.scene.add(directionalLight)

  const ambientLight = new THREE.AmbientLight(0xcccccc, 0.9)
  webgl.scene.add(ambientLight)
}

export function addSpotLight(webgl) {
  // make sure the background is also #000000
  const spotLight = new THREE.SpotLight(0xffffff, 1)
  spotLight.position.set(0, 5, 5)
  spotLight.target.position.set(0, 0, 1.2)
  spotLight.angle = Math.PI / 6
  spotLight.penumbra = 0.3

  webgl.scene.add(spotLight)
  webgl.scene.add(spotLight.target)

  if (window.DEBUG) {
    const spotLightHelper = new THREE.SpotLightHelper(spotLight)
    webgl.scene.add(spotLightHelper)
  }
}
