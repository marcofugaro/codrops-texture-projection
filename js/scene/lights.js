import * as THREE from 'three'

export function addLights(webgl) {
  // enable shadows
  webgl.renderer.shadowMap.enabled = true
  webgl.renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
  directionalLight.castShadow = true
  directionalLight.position.set(0, 10, 10)

  // higher values give better quality shadows
  // lower values give better performance
  directionalLight.shadow.mapSize.width = 1024
  directionalLight.shadow.mapSize.height = 1024

  // the size of the ortographic camera frustum
  // bigger means more diffuse shadows
  // TODO put this in a constant, the radius of the cylinder*2
  const size = 8
  directionalLight.shadow.camera.left = -size / 2
  directionalLight.shadow.camera.right = size / 2
  directionalLight.shadow.camera.top = size / 2
  directionalLight.shadow.camera.bottom = -size / 2
  directionalLight.shadow.camera.far = 100

  // uncomment this if there are some shadow artifacts
  // directionalLight.shadow.bias = -0.0001

  webgl.scene.add(directionalLight)

  // // make sure the background is also #000000
  // const spotLight = new THREE.SpotLight(0xffffff)
  // spotLight.position.set(0, 2, 4)
  // spotLight.angle = Math.PI / 6
  // spotLight.penumbra = 0.5

  // spotLight.castShadow = true

  // spotLight.shadow.mapSize.width = 1024
  // spotLight.shadow.mapSize.height = 1024

  // spotLight.shadow.camera.far = 100
  // spotLight.shadow.camera.fov = 30

  // webgl.scene.add(spotLight)

  const ambientLight = new THREE.AmbientLight(0xcccccc, 0.9)
  webgl.scene.add(ambientLight)
}
