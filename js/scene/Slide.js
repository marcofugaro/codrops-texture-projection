import * as THREE from 'three'
import { mapRange, lerp, clamp01 } from 'canvas-sketch-util/math'
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

// how much the animation of a single box lasts
export const ANIMATION_DURATION = 1.5 // seconds

// texture scale relative to viewport
const TEXTURE_SCALE = 0.7

export class Slide extends THREE.Group {
  instancedMesh
  // used for passing the transform to an instanced mesh
  dummy = new THREE.Object3D()

  delays = []
  // the displaced curves
  curves = []
  // the pristine curves
  targetCurves = []

  // used for the animation lerping
  previousPercentages = []
  percentages = []
  targetPercentage = 0

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
      color: new THREE.Color(webgl.controls.color),
      instanced: true,
    })
    webgl.controls.$onChanges(({ color }) => {
      if (color) {
        material.uniforms.baseColor.value = new THREE.Color(color.value)
      }
    })

    // allocate the projection data since we're using instancing
    allocateProjectionData(geometry, this.NUM_INSTANCES)

    // create the instanced mesh
    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.NUM_INSTANCES)
    this.instancedMesh.castShadow = true
    this.add(this.instancedMesh)

    const minX = -visibleWidthAtZDepth(-1, this.webgl.camera) / 2 - width * 0.6

    points.forEach((point, i) => {
      // the arriving point
      const [x, y] = point

      // create the curves!
      const curvePoints = this.generateCurve(x, y, 0, minX)
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

    this.delays = this.normalizeDelays(this.delays)
    webgl.controls.$onChanges(({ delayFactor }) => {
      if (delayFactor) {
        const delays = points.map(p => this.generateDelay(...p))
        this.delays = this.normalizeDelays(delays)
      }
    })

    // put the animation at 0
    this.percentages.length = this.NUM_INSTANCES
    this.percentages.fill(0)
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
        const { displacement } = this.webgl.controls
        this.mouseSphere = new THREE.Mesh(
          new THREE.SphereBufferGeometry(displacement, 16, 16),
          new THREE.MeshBasicMaterial({ color: 0xfffff00, transparent: true, opacity: 0.1 })
        )
        this.add(this.mouseSphere)
      }

      this.mouseSphere.position.copy(this.mousePoint)
    }
  }

  generateCurve(x, y, z, minX) {
    const points = []

    // must be odds so we have the middle frame
    const segments = 51

    const startX = minX
    const endX = minX * -1

    // TODO put this in a constant
    const startZ = -1
    const endZ = startZ

    for (let i = 0; i < segments; i++) {
      const offsetX = mapRange(i, 0, segments - 1, startX, endX)
      const halfIndex = segments / 2

      const noiseAmount = mapRangeTriple(i, 0, halfIndex, segments - 1, 1, 0, 1)
      const frequency = 0.3
      const noiseAmplitude = 0.6
      const noiseY = noise(offsetX * frequency) * noiseAmplitude * eases.quartOut(noiseAmount)
      const scaleY = mapRange(eases.quartIn(1 - noiseAmount), 0, 1, 0.2, 1)

      // TODO try to do a spiral
      // const noiseZ = noise(1000 + i * frequency) * 0.3

      const offsetZ = mapRangeTriple(i, 0, halfIndex, segments - 1, startZ, 0, endZ)

      points.push(new THREE.Vector3(x + offsetX, y * scaleY + noiseY, z + offsetZ))
    }
    return points
  }

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

    const { delayFactor } = this.webgl.controls
    const frequency = 0.5
    const delay = (noise(x * frequency, y * frequency) * 0.5 + 0.5) * delayFactor

    // const delay = Math.random() * 3
    return delay
  }

  // makes so the shortest delay is 0
  normalizeDelays = delays => {
    const minDelay = Math.min(...delays)
    return delays.map(delay => delay - minDelay)
  }

  animateTo = percentage => {
    this.tStart = this.webgl.time
    this.previousPercentages = this.percentages.slice()
    this.targetPercentage = percentage
  }

  moveTo = percentage => {
    this.percentages.fill(percentage)
    this.targetPercentage = percentage
  }

  update(dt, time) {
    const { displacement } = this.webgl.controls

    for (let i = 0; i < this.NUM_INSTANCES; i++) {
      const curve = this.curves[i]
      const targetCurve = this.targetCurves[i]
      const delay = this.delays[i]

      if (this.tStart) {
        const delayDelay = 0.5 // ✨ magic number

        // where to put the box on the curve,
        // 0 is left of the screen, 0.5 center of the screen, 1 is right of the screen
        this.percentages[i] = lerp(
          this.previousPercentages[i],
          this.targetPercentage,
          // nice complicated equation! this equation defines the "feel" of the animation.
          // a simplified version would be `(time - this.tStart) / ANIMATION_DURATION`
          clamp01(
            (time - (this.tStart + delay * delayDelay)) /
              (ANIMATION_DURATION + delay * (1 - delayDelay))
          )
        )
      }

      // if it's showing
      if (this.percentages[i] > 0 && this.percentages[i] < 1) {
        curve.points.forEach((point, j) => {
          const { x, y } = point
          const targetPoint = targetCurve.points[j]

          // if the user has interacted
          if (this.mousePoint) {
            // displace the curve points
            if (point.distanceTo(this.mousePoint) < displacement) {
              const direction = point.clone().sub(this.mousePoint)
              const displacementAmount = displacement - direction.length()
              direction.setLength(displacementAmount)
              direction.add(point)

              point.lerp(direction, dt * 6) // ✨ magic number
            }

            // and move them back to their original position
            if (point.distanceTo(targetPoint) > 0.01) {
              point.lerp(targetPoint, dt * 8) // ✨ magic number
            }
          }

          // the waving effect
          const { frequency, speed, amplitude } = this.webgl.controls.turbulence
          const z = noise(x * frequency - time * speed, y * frequency) * amplitude
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
      }

      // align the box on the curve
      alignOnCurve(this.dummy, curve, this.percentages[i])
      this.dummy.updateMatrix()
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix)
      this.instancedMesh.instanceMatrix.needsUpdate = true
    }
  }
}
