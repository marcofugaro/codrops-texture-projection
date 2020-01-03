import * as THREE from 'three'
import { mapRange, lerp, clamp01 } from 'canvas-sketch-util/math'
import * as eases from 'eases'
import ProjectedMaterial, {
  projectInstanceAt,
  allocateProjectionData,
} from 'three-projected-material'
import {
  alignOnCurve,
  visibleHeightAtZDepth,
  visibleWidthAtZDepth,
  mouseToCoordinates,
} from '../lib/three-utils'
import { noise, poisson, mapRangeTriple, timed } from '../lib/utils'

// how much the animation of a single box lasts
export const ANIMATION_DURATION = 1 // seconds

// texture scale relative to viewport
const TEXTURE_SCALE = 0.7

// how much behind the objects animate from
const STARTING_Z = -1

export class SlideNoise extends THREE.Group {
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
    if (ratio < 1) {
      this.height = visibleHeightAtZDepth(0, webgl.camera) * TEXTURE_SCALE
      this.width = this.height * ratio
    } else {
      this.width = visibleWidthAtZDepth(0, webgl.camera) * TEXTURE_SCALE
      this.height = this.width * (1 / ratio)
    }
    // make it a little bigger
    this.width *= 1.5
    this.height *= 1.1

    // get the points xy coordinates based on poisson-disc sampling
    const poissonSampling = window.DEBUG ? timed(poisson, 'Poisson-disc sampling') : poisson
    this.points = poissonSampling([this.width, this.height], 7.73, 9.66)

    // add the left/right waves form
    this.points = this.points.filter(([x, y]) => {
      if (x < (Math.sin(y * 3) * Math.sin(y * 2) * Math.sin(y * 4.7) * 0.5 + 0.5) * 0.7) {
        return false
      }

      if (
        x >
        (Math.sin(y * 3) * Math.sin(y * 2) * Math.sin(y * 4.7) * 0.5 - 0.5) * 0.7 + this.width
      ) {
        return false
      }

      return true
    })

    // center them
    this.points = this.points.map(point => [point[0] - this.width / 2, point[1] - this.height / 2])

    this.NUM_INSTANCES = this.points.length

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
    this.add(this.instancedMesh)

    const minX = -visibleWidthAtZDepth(STARTING_Z, this.webgl.camera) / 2 - this.width * 0.6

    this.points.forEach((point, i) => {
      // the arriving point
      const [x, y] = point

      // create the curves!
      const curvePoints = this.generateCurve(x, y, 0, minX)
      const curve = new THREE.CatmullRomCurve3(curvePoints)
      this.curves.push(curve)
      this.targetCurves.push(curve.clone())

      // show the curves only in debug mode and not all of them
      if (window.DEBUG && i % 15 === 0) {
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
        const delays = this.points.map(p => this.generateDelay(...p))
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
    const halfIndex = (segments - 1) / 2

    const startX = minX
    const endX = minX * -1

    const startZ = STARTING_Z
    const endZ = startZ

    for (let i = 0; i < segments; i++) {
      const offsetX = mapRange(i, 0, segments - 1, startX, endX)

      const noiseAmount = mapRangeTriple(i, 0, halfIndex, segments - 1, 1, 0, 1)
      const frequency = 0.25
      const noiseAmplitude = 0.6
      const noiseY = noise(offsetX * frequency) * noiseAmplitude * eases.quartOut(noiseAmount)
      const scaleY = mapRange(eases.quartIn(1 - noiseAmount), 0, 1, 0.2, 1)

      const offsetZ = mapRangeTriple(i, 0, halfIndex, segments - 1, startZ, 0, endZ)

      points.push(new THREE.Vector3(x + offsetX, y * scaleY + noiseY, z + offsetZ))
    }
    return points
  }

  generateDelay(x, y) {
    const { delayFactor } = this.webgl.controls
    const frequency = 0.5
    const delay = (noise(x * frequency, y * frequency) * 0.5 + 0.5) * delayFactor
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

      if (this.tStart !== undefined) {
        const delayDelay = 0.5 // ✨ magic number

        // where to put the box on the curve,
        // 0 is left of the screen, 0.5 center of the screen, 1 is right of the screen
        this.percentages[i] = lerp(
          this.previousPercentages[i],
          this.targetPercentage,
          // nice complicated equation! this equation defines the "feel" of the animation.
          // a simplified version would be `(time  - (this.tStart + delay)) / ANIMATION_DURATION`
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

          // if the user has interacted and we're not on mobile
          if (this.mousePoint && !window.IS_MOBILE) {
            // displace the curve points
            if (point.distanceTo(this.mousePoint) < displacement) {
              const direction = point.clone().sub(this.mousePoint)
              const displacementAmount = displacement - direction.length()
              direction.setLength(displacementAmount)
              direction.add(point)

              point.lerp(direction, 0.2) // ✨ magic number
            }

            // and move them back to their original position
            if (point.distanceTo(targetPoint) > 0.01) {
              point.lerp(targetPoint, 0.27) // ✨ magic number
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
