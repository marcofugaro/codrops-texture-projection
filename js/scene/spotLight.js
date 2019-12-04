import * as THREE from 'three'

export function addSpotLight(webgl) {
  // enable shadows
  webgl.renderer.shadowMap.enabled = true
  webgl.renderer.shadowMap.type = THREE.PCFSoftShadowMap

  // make sure the background is also #000000
  const spotLight = new THREE.SpotLight(0xffffff, 1)
  spotLight.position.set(0, 2, 4)
  spotLight.angle = Math.PI / 6
  spotLight.penumbra = 0.5

  spotLight.castShadow = true

  // higher values give better quality shadows
  // lower values give better performance
  spotLight.shadow.mapSize.width = 1024
  spotLight.shadow.mapSize.height = 1024

  spotLight.shadow.camera.fov = 30
  spotLight.shadow.camera.far = 100

  webgl.scene.add(spotLight)

  // const ambientLight = new THREE.AmbientLight(0xcccccc, 0.9)
  // webgl.scene.add(ambientLight)
}
