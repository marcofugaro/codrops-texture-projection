import * as THREE from 'three'
import { mapRange } from 'canvas-sketch-util/math'
import * as eases from 'eases'
import {
  ProjectedMaterial,
  projectInstanceAt,
  allocateProjectionData,
} from '../lib/ProjectedMaterial'
import {
  alignOnCurve,
  visibleHeightAtZDepth,
  visibleWidthAtZDepth,
  mouseToCoordinates,
} from '../lib/three-utils'
import { noise, poisson, mapRangeTriple, timed } from '../lib/utils'
import { ANIMATION_DURATION } from './Slides'

// how much there is between the first and the last to arrive
const DELAY_MULTIPLICATOR = 2.2

// texture scale relative to viewport
const TEXTURE_SCALE = 0.7

// how much to start displacing on mousemove
const DISPLACEMENT_RADIUS = 0.5

export class Slide extends THREE.Group {
  instancedMesh
  // used for passing the transform to an instanced mesh
  dummy = new THREE.Object3D()

  delays = []
  // the displaced curves
  curves = []
  // the pristine curves
  targetCurves = []

  constructor(webgl, { texture, ...options }) {
    super(options)
    this.webgl = webgl

    // calculate the width and height the boxes will stay in
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
    // make it a little bigger
    width = width * 1.5
    height = height * 1.1

    // get the points xy coordinates based on poisson-disc sampling
    const poissonSampling = window.DEBUG ? timed(poisson, 'Poisson-disc sampling') : poisson
    let points = poissonSampling([width, height], 7.73, 9.66)

    points = points.filter(([x, y]) => {
      if (x < (Math.sin(y * 3) * Math.sin(y * 2) * Math.sin(y * 4.7) * 0.5 + 0.5) * 0.7) {
        return false
      }

      if (x > (Math.sin(y * 3) * Math.sin(y * 2) * Math.sin(y * 4.7) * 0.5 - 0.5) * 0.7 + width) {
        return false
      }

      return true
    })

    // center them
    points = points.map(point => [point[0] - width / 2, point[1] - height / 2])

    this.NUM_INSTANCES = points.length

    // create the geometry and material
    const geometry = new THREE.BoxBufferGeometry(0.1, 0.2, 0.1)
    const material = new ProjectedMaterial({
      camera: webgl.camera,
      texture,
      textureScale: TEXTURE_SCALE,
      color: new THREE.Color(webgl.controls.materialColor),
      instanced: true,
    })

    // allocate the projection data since we're using instancing
    allocateProjectionData(geometry, this.NUM_INSTANCES)

    // create the instanced mesh
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.NUM_INSTANCES)
    this.instancedMesh.castShadow = true
    this.add(this.instancedMesh)

    points.forEach((point, i) => {
      // the arriving point
      const [x, y] = point

      // create the curves!
      const curvePoints = this.generateCurve(x, y, 0)
      const curve = new THREE.CatmullRomCurve3(curvePoints)
      this.curves.push(curve)
      this.targetCurves.push(curve.clone())

      // show the curves only in debug mode and not all of them
      if (window.DEBUG && i % 10 === 0) {
        const curveGeometry = new THREE.Geometry().setFromPoints(curve.points)
        const curveMaterial = new THREE.LineBasicMaterial({
          color: 0x000000,
          transparent: true,
          opacity: 0.2,
        })
        const curveMesh = new THREE.Line(curveGeometry, curveMaterial)
        curve.mesh = curveMesh
        this.add(curveMesh)
      }

      // give delay to each box
      const delay = this.generateDelay(x, y)
      this.delays.push(delay)

      // put it at its center position
      alignOnCurve(this.dummy, curve, 0.5)
      this.dummy.updateMatrix()
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix)

      // project the texture!
      this.dummy.updateMatrixWorld()
      projectInstanceAt(i, this.instancedMesh, this.dummy.matrixWorld)

      // put it at the start again
      alignOnCurve(this.dummy, curve, 0)
      this.dummy.updateMatrix()
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix)
    })

    // TODO handle this better
    const minDelay = Math.min(...this.delays)
    this.delays = this.delays.map(delay => delay - minDelay)
  }

  onPointerMove(event, [x, y]) {
    this.mousePoint = mouseToCoordinates({
      x,
      y,
      camera: this.webgl.camera,
      width: this.webgl.width,
      height: this.webgl.height,
      targetZ: -0.1,
    })

    if (window.DEBUG) {
      if (!this.mouseSphere) {
        this.mouseSphere = new THREE.Mesh(
          new THREE.SphereBufferGeometry(DISPLACEMENT_RADIUS, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xfffff00, transparent: true, opacity: 0.1 })
        )
        this.add(this.mouseSphere)
      }

      this.mouseSphere.position.copy(this.mousePoint)
    }
  }

  generateCurve(x, y, z) {
    const points = []

    // must be odds so we have the middle frame
    const segments = 51

    const outOfViewX =
      mouseToCoordinates({
        x: 0,
        y: this.webgl.width / 2,
        camera: this.webgl.camera,
        width: this.webgl.width,
        height: this.webgl.height,
      }).x * 1.4

    const startX = outOfViewX
    const endX = outOfViewX * -1

    const startZ = -1
    const endZ = startZ

    for (let i = 0; i < segments; i++) {
      const offsetX = mapRange(i, 0, segments - 1, startX, endX)
      const halfIndex = segments / 2

      const noiseAmount = mapRangeTriple(i, 0, halfIndex, segments - 1, 1, 0, 1)
      const noiseZoom = 0.3
      const noiseAmplitude = 0.6
      const noiseY = noise(offsetX * noiseZoom) * noiseAmplitude * eases.quartOut(noiseAmount)
      const scaleY = mapRange(eases.quartIn(1 - noiseAmount), 0, 1, 0.2, 1)

      // TODO try to do a spiral
      // const noiseZ = noise(1000 + i * noiseZoom) * 0.3

      const offsetZ = mapRangeTriple(i, 0, halfIndex, segments - 1, startZ, 0, endZ)

      points.push(new THREE.Vector3(x + offsetX, y * scaleY + noiseY, z + offsetZ))
    }
    return points
  }

  // TODO maybe play with speed rather than delay
  generateDelay(x, y) {
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
    // TODO handle this better
    const delay = (noise(x * noiseZoom2, y * noiseZoom2) * 0.5 + 0.5) * DELAY_MULTIPLICATOR

    // const delay = Math.random() * 3

    return delay
  }

  enter() {
    this.tStart = this.webgl.time
    this.isEntering = true
    this.isReversed = false
  }

  exit() {
    this.tStart = this.webgl.time
    this.isEntering = false
    this.isReversed = false
  }

  enterReversed() {
    this.tStart = this.webgl.time
    this.isEntering = true
    this.isReversed = true
  }

  exitReversed() {
    this.tStart = this.webgl.time
    this.isEntering = false
    this.isReversed = true
  }

  update(dt, time) {
    for (let i = 0; i < this.NUM_INSTANCES; i++) {
      const curve = this.curves[i]
      const targetCurve = this.targetCurves[i]
      const delay = this.delays[i]

      // if the user has interacted
      // displace the curve where the user has interacted
      curve.points.forEach((point, j) => {
        const { x, y } = point
        const targetPoint = targetCurve.points[j]

        if (this.mousePoint) {
          // displace the curve points
          if (point.distanceTo(this.mousePoint) < DISPLACEMENT_RADIUS) {
            const direction = point.clone().sub(this.mousePoint)
            const displacementAmount = DISPLACEMENT_RADIUS - direction.length()
            direction.setLength(displacementAmount)
            direction.add(point)

            point.lerp(direction, dt * 6)
          }

          // and move them back to their original position
          if (point.distanceTo(targetPoint) > 0.01) {
            point.lerp(targetPoint, dt * 8)
          }
        }

        // the waving effect
        const noiseZoom = 0.5
        const speed = 0.2
        const amplitude = 0.2
        const z = noise(x * noiseZoom - time * speed, y * noiseZoom) * amplitude
        point.z = targetPoint.z + z
      })

      // update the debug mode lines
      if (window.DEBUG && curve.mesh) {
        curve.points.forEach((point, j) => {
          const vertex = curve.mesh.geometry.vertices[j]
          vertex.copy(point)
        })
        curve.mesh.geometry.verticesNeedUpdate = true
      }

      // align the box on the curve
      let percentage = 0
      if (this.tStart) {
        if (this.isEntering) {
          percentage = mapRange(
            time - this.tStart,
            // ✨ magic number
            0 + delay * 0.5,
            ANIMATION_DURATION + delay,
            this.isReversed ? 0.5 : 0,
            this.isReversed ? 0 : 0.5,
            true
          )
        } else {
          percentage = mapRange(
            time - this.tStart,
            0 + delay,
            ANIMATION_DURATION + delay,
            this.isReversed ? 1 : 0.5,
            this.isReversed ? 0.5 : 1,
            true
          )
        }
      }

      alignOnCurve(this.dummy, curve, percentage)
      this.dummy.updateMatrix()
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix)
      this.instancedMesh.instanceMatrix.needsUpdate = true
    }
  }
}
