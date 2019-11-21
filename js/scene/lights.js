import * as THREE from 'three'
import { visibleWidthAtZDepth } from '../lib/three-utils'

export function addLights(webgl) {
  // enable shadows
  webgl.renderer.shadowMap.enabled = true
  webgl.renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6)
  directionalLight.castShadow = true
  directionalLight.position.set(0, 10, 10)

  // higher values give better quality shadows
  // lower values give better performance
  directionalLight.shadow.mapSize.width = 512
  directionalLight.shadow.mapSize.height = 512

  // the size of the ortographic camera frustum
  // bigger means more diffuse shadows
  const width = visibleWidthAtZDepth(-5, webgl.camera)
  const height = 3
  directionalLight.shadow.camera.left = -width / 2
  directionalLight.shadow.camera.right = width / 2
  directionalLight.shadow.camera.top = height / 2
  directionalLight.shadow.camera.bottom = -height / 2
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
