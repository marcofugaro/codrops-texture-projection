import * as THREE from 'three'
import { mapRange } from 'canvas-sketch-util/math'
import * as eases from 'eases'
import { ProjectedMaterial } from '../lib/ProjectedMaterial'
import {
  alignOnCurve,
  visibleHeightAtZDepth,
  visibleWidthAtZDepth,
  mouseToCoordinates,
} from '../lib/three-utils'
import assets from '../lib/AssetManager'
import { noise, poisson } from '../lib/utils'

const ANIMATION_DURATION = 2 // seconds
const DELAY_MULTIPLICATOR = 2.5
const TEXTURE_SCALE = 0.7

const DISPLACEMENT_RADIUS = 0.3
const MOUSEPOINT_DECAY = 1 // seconds

// preload the texture
const textureKey = assets.queue({
  url: 'images/justin-essah-unsplash.jpg',
  type: 'texture',
})

export class Boxes extends THREE.Group {
  boxes = []
  curves = []
  delays = []
  mousePoints = []

  constructor({ webgl, ...options }) {
    super(options)
    this.webgl = webgl

    const texture = assets.get(textureKey)

    const ratio = texture.image.naturalWidth / texture.image.naturalHeight
    let width
    let height
    if (ratio < 1) {
      height = visibleHeightAtZDepth(0, webgl.camera) * TEXTURE_SCALE
      width = height * ratio
    } else {
      width = visibleWidthAtZDepth(0, webgl.camera) * TEXTURE_SCALE
      height = width * (1 / ratio)
    }

    // get the points xy coordinates based on poisson-disc sampling
    if (window.DEBUG) console.time('⏱Poisson-disc sampling')
    const pointsXY = poisson([width, height])
    if (window.DEBUG) console.timeEnd('⏱Poisson-disc sampling')
    if (window.DEBUG) console.log(`Generated ${pointsXY.length} points`)

    pointsXY.forEach(point => {
      // the arriving point
      const [x, y] = [point[0] - width / 2, point[1] - height / 2]
      const noiseZoom = 0.5
      const z = noise(x * noiseZoom, y * noiseZoom) * 0.2

      // create the box!
      const geometry = new THREE.BoxBufferGeometry(0.1, 0.2, 0.1)
      const material = new ProjectedMaterial({
        camera: webgl.camera,
        texture,
        textureScale: TEXTURE_SCALE,
        color: 0x222222,
      })
      const box = new THREE.Mesh(geometry, material)
      box.castShadow = true
      box.receiveShadow = true
      this.boxes.push(box)
      this.add(box)

      // create the curves!
      const curvePoints = this.generateCurve(x, y, z)
      const curve = new THREE.CatmullRomCurve3(curvePoints)
      this.curves.push(curve)

      // show the curves only in debug mode
      if (window.DEBUG) {
        const curveGeometry = new THREE.BufferGeometry().setFromPoints(curve.points)
        const curveMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.2,
        })
        const curveMesh = new THREE.Line(curveGeometry, curveMaterial)
        this.add(curveMesh)
      }

      // give delay to each box
      const delay = this.generateDelay(x, y, z)
      this.delays.push(delay)

      // put it at its final position
      alignOnCurve(box, curve, 1)

      // project the texture!
      box.updateMatrixWorld()
      box.material.project(box.matrixWorld)
    })
  }

  onPointerMove(event, [x, y]) {
    const mousePoint = {
      timestamp: this.webgl.time,
      scale: 1,
    }

    mousePoint.position = mouseToCoordinates({
      x,
      y,
      camera: this.webgl.camera,
      width: this.webgl.width,
      height: this.webgl.height,
    })

    if (window.DEBUG) {
      const mouseSphere = new THREE.Mesh(
        new THREE.SphereBufferGeometry(DISPLACEMENT_RADIUS, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xfffff00, transparent: true, opacity: 0.3 })
      )
      mouseSphere.position.copy(mousePoint.position)
      this.add(mouseSphere)
      mousePoint.mesh = mouseSphere
    }

    this.mousePoints.push(mousePoint)
  }

  generateCurve(x, y, z) {
    const points = []
    const segments = 50
    const startX = -5
    for (let i = 0; i < segments; i++) {
      const offsetX = mapRange(i, 0, segments - 1, startX, 0)

      const noiseZoom = 0.1 / (segments / 20)
      const noiseY = noise(i * noiseZoom) * 0.6 * eases.quartOut(mapRange(i, 0, segments - 1, 1, 0))
      const scaleY = mapRange(eases.quartIn(mapRange(i, 0, segments - 1, 0, 1)), 0, 1, 0.2, 1)

      // const noiseZ = noise(1000 + i * noiseZoom) * 0.3

      points.push(new THREE.Vector3(x + offsetX, y * scaleY + noiseY, z))
    }
    return points
  }

  generateDelay(x, y, z) {
    // const distancePoint = new THREE.Vector3(
    //   width * 0 - width / 2,
    //   height * 0.5 - height / 2,
    //   z
    // )
    // const arrivingPosition = new THREE.Vector3(x, y, z)
    // const distance = arrivingPosition.distanceTo(distancePoint)

    // const delay = Math.pow(distance, 2)
    // const delay = distance * 2

    const noiseZoom2 = 0.5
    // 1000 is to differentiate it from the noise used for the z coordinate
    // TODO handle this better
    const delay =
      (noise(1000 + x * noiseZoom2, 1000 + y * noiseZoom2) * 0.5 + 0.5) * DELAY_MULTIPLICATOR

    // const delay = Math.random() * 3

    return delay
  }

  update(dt, time) {
    this.boxes.forEach((box, i) => {
      const curve = this.curves[i]
      const delay = this.delays[i]

      const percentage = mapRange(time, 0 + delay, ANIMATION_DURATION + delay, 0, 1, true)
      alignOnCurve(box, curve, percentage)

      this.mousePoints.forEach(mousePoint => {
        // TODO make the box ease
        if (box.position.distanceTo(mousePoint.position) < DISPLACEMENT_RADIUS * mousePoint.scale) {
          const direction = box.position.clone().sub(mousePoint.position)
          // TODO displace them not at the end of a sphere
          const displacementAmount = DISPLACEMENT_RADIUS * mousePoint.scale - direction.length()
          direction.setLength(displacementAmount)
          box.position.add(direction)
        }
      })
    })

    this.mousePoints.forEach((mousePoint, i) => {
      const scale = eases.quadIn(
        mapRange(time, mousePoint.timestamp, mousePoint.timestamp + MOUSEPOINT_DECAY, 1, 0, true)
      )

      if (scale <= 0) {
        if (window.DEBUG) this.remove(mousePoint.mesh)
        this.mousePoints.splice(i, 1)
        return
      }

      mousePoint.scale = scale
      if (window.DEBUG) mousePoint.mesh.scale.setScalar(scale)
    })
  }
}
