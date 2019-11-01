import * as THREE from 'three'
import { mapRange } from 'canvas-sketch-util/math'
import * as eases from 'eases'
import { ProjectedMaterial } from '../lib/ProjectedMaterial'
import { alignOnCurve } from '../lib/three-utils'
import assets from '../lib/AssetManager'
import { noise, poisson } from '../lib/utils'

const AREA_WIDTH = 2.8
const AREA_HEIGHT = 1.7
const ANIMATION_DURATION = 2 // seconds
const DELAY_MULTIPLICATOR = 2.5

// preload the texture
const textureKey = assets.queue({
  url: 'http://mbnsay.com/rayys/images/1K_UV_checker.jpg',
  type: 'texture',
})

export class Boxes extends THREE.Group {
  boxes = []
  curves = []
  delays = []

  constructor({ webgl, ...options }) {
    super(options)
    this.webgl = webgl

    const texture = assets.get(textureKey)

    // get the points xy coordinates based on poisson-disc sampling
    console.time('⏱Poisson-disc sampling')
    const pointsXY = poisson([AREA_WIDTH, AREA_HEIGHT])
    console.timeEnd('⏱Poisson-disc sampling')
    console.log(`Generated ${pointsXY.length} points`)

    pointsXY.forEach(point => {
      // the arriving point
      const [x, y] = [point[0] - AREA_WIDTH / 2, point[1] - AREA_HEIGHT / 2]
      const noiseZoom = 0.5
      const z = noise(x * noiseZoom, y * noiseZoom) * 0.4

      // create the box!
      const geometry = new THREE.BoxBufferGeometry(0.1, 0.2, 0.1)
      const material = new ProjectedMaterial({
        camera: webgl.camera,
        texture,
        color: 0x333333,
      })
      const box = new THREE.Mesh(geometry, material)
      this.boxes.push(box)
      this.add(box)

      // create the curves!
      const curvePoints = this.generateCurve(x, y, z)
      const curve = new THREE.CatmullRomCurve3(curvePoints)
      this.curves.push(curve)

      // show the curves only in debug mode
      if (window.DEBUG) {
        const points = curve.getPoints(50)
        const curveGeometry = new THREE.BufferGeometry().setFromPoints(points)
        const curveMaterial = new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.2,
        })
        const curveMesh = new THREE.Line(curveGeometry, curveMaterial)

        this.add(curveMesh)
      }

      // give delay to each box

      // const distancePoint = new THREE.Vector3(
      //   AREA_WIDTH * 0 - AREA_WIDTH / 2,
      //   AREA_HEIGHT * 0.5 - AREA_HEIGHT / 2,
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

      this.delays.push(delay)

      // put it at its final position
      alignOnCurve(box, curve, 1)

      // project the texture!
      box.updateMatrixWorld()
      box.material.project(box.matrixWorld)
    })
  }

  generateCurve(x, y, z) {
    const points = []
    const segments = 20
    const startX = -5
    for (let i = 0; i < segments; i++) {
      const offsetX = mapRange(i, 0, segments - 1, startX, 0)

      const noiseZoom = 0.1
      const noiseY = noise(i * noiseZoom) * 0.6 * eases.quartOut(mapRange(i, 0, segments - 1, 1, 0))
      const scaleY = mapRange(eases.quartIn(mapRange(i, 0, segments - 1, 0, 1)), 0, 1, 0.2, 1)

      // const noiseZ = noise(1000 + i * noiseZoom) * 0.3

      points.push(new THREE.Vector3(x + offsetX, y * scaleY + noiseY, z))
    }
    return points
  }

  update(dt, time) {
    this.boxes.forEach((box, i) => {
      const curve = this.curves[i]
      const delay = this.delays[i]

      const percentage = mapRange(time, 0 + delay, ANIMATION_DURATION + delay, 0, 1, true)
      alignOnCurve(box, curve, percentage)
    })
  }
}
