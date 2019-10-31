import * as THREE from 'three'
import { mapRange } from 'canvas-sketch-util/math'
import { quadOut } from 'eases'
import { ProjectedMaterial } from '../lib/ProjectedMaterial'
import { alignOnCurve } from '../lib/three-utils'
import assets from '../lib/AssetManager'

const AREA_WIDTH = 2.8
const AREA_HEIGHT = 1.7

// preload the texture
const textureKey = assets.queue({
  url: 'http://mbnsay.com/rayys/images/1K_UV_checker.jpg',
  type: 'texture',
})

export class Boxes extends THREE.Group {
  boxes = []
  curves = []

  constructor({ webgl, ...options }) {
    super(options)
    this.webgl = webgl

    const unitX = 0.1
    const unitY = 0.1
    const rows = Math.ceil(AREA_HEIGHT / unitX)
    const columns = Math.ceil(AREA_WIDTH / unitY)

    const texture = assets.get(textureKey)
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        // create the box!
        const geometry = new THREE.BoxBufferGeometry(unitX, unitY, unitY)
        const material = new ProjectedMaterial({
          camera: webgl.camera,
          texture,
          color: 0xffffff,
        })
        const box = new THREE.Mesh(geometry, material)
        this.boxes.push(box)
        this.add(box)

        // create the curves!
        const x = mapRange(column, 0, columns - 1, -AREA_WIDTH / 2, AREA_WIDTH / 2)
        const y = mapRange(row, 0, rows - 1, -AREA_HEIGHT / 2, AREA_HEIGHT / 2)
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x - 4, y, 0.5),
          new THREE.Vector3(x - 2, y - 0.3, 0),
          new THREE.Vector3(x - 1, y + 0.3, -0.5),
          new THREE.Vector3(x, y, 0),
        ])
        this.curves.push(curve)

        // show the curves only in debug mode
        if (window.DEBUG) {
          const points = curve.getPoints(50)
          const curveGeometry = new THREE.BufferGeometry().setFromPoints(points)
          const curveMaterial = new THREE.LineBasicMaterial({ color: 0xffffff })
          const curveMesh = new THREE.Line(curveGeometry, curveMaterial)

          this.add(curveMesh)
        }

        // put it at its final position
        alignOnCurve(box, curve, 1)

        // project the texture!
        box.updateMatrixWorld()
        box.material.project(box.matrixWorld)
      }
    }
  }

  update(dt, time) {
    const percentage = mapRange(time, 0, 5, 0, 1, true)
    this.boxes.forEach((box, i) => {
      const curve = this.curves[i]

      alignOnCurve(box, curve, quadOut(percentage))
    })
  }
}
