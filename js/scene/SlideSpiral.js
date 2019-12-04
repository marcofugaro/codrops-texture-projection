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
import { poisson, timed, mapRangeTriple } from '../lib/utils'

// how much the animation of a single box lasts
export const ANIMATION_DURATION = 1.3 // seconds

// texture scale relative to viewport
const TEXTURE_SCALE = 0.7

export class SlideSpiral extends THREE.Group {
  instancedMesh
  // used for passing the transform to an instanced mesh
  dummy = new THREE.Object3D()

  delaysFromOutside = []
  delaysFromCenter = []
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
    width = width * 1.1
    height = height * 1.1

    // get the points xy coordinates based on poisson-disc sampling
    const poissonSampling = window.DEBUG ? timed(poisson, 'Poisson-disc sampling') : poisson
    let points = poissonSampling([width, height], 8, 9.66)

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
      this.delaysFromOutside.push(this.generateDelayFromOutside(x, y, width, height))
      this.delaysFromCenter.push(this.generateDelayFromCenter(x, y))

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

    this.delaysFromOutside = this.normalizeDelays(this.delaysFromOutside)
    this.delaysFromCenter = this.normalizeDelays(this.delaysFromCenter)
    webgl.controls.$onChanges(({ delayFactor, spiralRadius }) => {
      if (delayFactor) {
        const delaysFromCenter = points.map(p => this.generateDelayFromCenter(...p))
        this.delaysFromCenter = this.normalizeDelays(delaysFromCenter)

        const delaysFromOutside = points.map(p =>
          this.generateDelayFromOutside(...p, width, height)
        )
        this.delaysFromOutside = this.normalizeDelays(delaysFromOutside)
      }
      if (spiralRadius) {
        points.forEach((point, i) => {
          const [x, y] = point
          const newPoints = this.generateCurve(x, y, 0)
          this.targetCurves[i].points = newPoints
          this.curves[i].points = newPoints.map(p => p.clone())
        })
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

  generateCurve(x, y, z) {
    const points = []

    // must be odds so we have the middle frame
    const segments = 51
    const halfIndex = (segments - 1) / 2

    const endZ = this.webgl.camera.position.z * 2
    const startZ = endZ * -1

    for (let i = 0; i < segments; i++) {
      const currentZ = mapRange(i, 0, segments - 1, startZ, endZ)

      // how much to go from the tube to the final image, 0 is tube, 1 is final image
      const scaleAmount = mapRangeTriple(i, 0, halfIndex, segments - 1, 1, 0, 1)
      const scale = mapRange(eases.quartIn(1 - scaleAmount), 0, 1, 0, 1)

      // radius and angle of the final image
      const radius = Math.hypot(x, y)
      const angle = Math.atan2(y, x)

      // frequency of the spiral
      const frequency = 0.2

      // radius of the tube where they travel
      const { spiralRadius } = this.webgl.controls
      const scaledRadius = radius * scale + spiralRadius * (1 - scale)
      const helixX = scaledRadius * Math.cos((halfIndex - i) * frequency + angle)
      const helixY = scaledRadius * Math.sin((halfIndex - i) * frequency + angle)

      points.push(new THREE.Vector3(helixX, helixY, currentZ))
    }
    return points
  }

  generateDelayFromOutside(x, y, width, height) {
    const { delayFactor } = this.webgl.controls

    const center = new THREE.Vector2(0, 0)
    const targetPosition = new THREE.Vector2(x, y)
    const distance = targetPosition.distanceTo(center)

    // linear
    const delay = Math.hypot(width / 2, height / 2) - distance

    // pow
    // const delay = (distance ** 2)
    // inverse pow
    // const delay = (distance ** 1 / 3)
    // log
    // const delay = Math.log(distance + 1)

    return delay * delayFactor
  }

  generateDelayFromCenter(x, y) {
    const { delayFactor } = this.webgl.controls

    const center = new THREE.Vector2(0, 0)
    const targetPosition = new THREE.Vector2(x, y)
    const distance = targetPosition.distanceTo(center)

    // linear
    const delay = distance

    // pow
    // const delay = (distance ** 2)
    // inverse pow
    // const delay = (distance ** 1 / 3)
    // log
    // const delay = Math.log(distance + 1)

    return delay * delayFactor
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
      const delay =
        this.targetPercentage === 0.5 ? this.delaysFromOutside[i] : this.delaysFromCenter[i]

      if (this.tStart) {
        // where to put the box on the curve,
        // 0 is left of the screen, 0.5 center of the screen, 1 is right of the screen
        this.percentages[i] = lerp(
          this.previousPercentages[i],
          this.targetPercentage,
          clamp01((time - (this.tStart + delay)) / ANIMATION_DURATION)
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

              point.lerp(direction, 0.2) // ✨ magic number
            }

            // and move them back to their original position
            if (point.distanceTo(targetPoint) > 0.01) {
              point.lerp(targetPoint, 0.27) // ✨ magic number
            }
          }
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
