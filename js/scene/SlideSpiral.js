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
  extractGeometry,
} from '../lib/three-utils'
import { poisson, timed, mapRangeTriple, impulseMultiple } from '../lib/utils'
import assets from '../lib/AssetManager'

// how much the animation of a single box lasts
export const ANIMATION_DURATION = 1.2 // seconds

// texture scale relative to viewport
const TEXTURE_SCALE = 0.7

// the x rotation so the leaves are nicely flat
const OPTIMAL_ROTATION = Math.PI * 0.6

const leafKey = assets.queue({
  url: 'maple-leaf.glb',
  type: 'gltf',
})

const center = new THREE.Vector2(0, 0)

export class SlideSpiral extends THREE.Group {
  instancedMesh
  // used for passing the transform to an instanced mesh
  dummy = new THREE.Object3D()

  points = []

  distancesFromPerimeter = []
  distancesFromCenter = []
  delaysFromPerimeter = []
  delaysFromCenter = []

  // the displaced curves
  curves = []
  // the pristine curves
  targetCurves = []
  // the rotation effect
  rotations = []

  // used for the animation lerping
  previousPercentages = []
  percentages = []
  targetPercentage = 0

  constructor(webgl, { texture, ...options }) {
    super(options)
    this.webgl = webgl

    this.initialCameraZ = this.webgl.camera.position.z

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
    this.width *= 1.1
    this.height *= 1.1

    // get the points xy coordinates based on poisson-disc sampling
    const poissonSampling = window.DEBUG ? timed(poisson, 'Poisson-disc sampling') : poisson
    this.points = poissonSampling([this.width, this.height], 13, 14)

    // center them
    this.points = this.points.map(point => [point[0] - this.width / 2, point[1] - this.height / 2])

    this.NUM_INSTANCES = this.points.length

    const leaf = assets.get(leafKey).scene.clone()
    const geometry = extractGeometry(leaf)

    geometry.scale(0.085, 0.085, 0.085)
    geometry.rotateY(Math.PI)

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

    this.points.forEach((point, i) => {
      // the arriving point
      const [x, y] = point

      // create the curves!
      const curvePoints = this.generateCurve(x, y, 0)
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
      this.distancesFromPerimeter.push(this.getDistanceFromPerimeter(x, y))
      this.distancesFromCenter.push(this.getDistanceFromCenter(x, y))
      this.delaysFromPerimeter.push(this.generateDelay(this.distancesFromPerimeter[i]))
      this.delaysFromCenter.push(this.generateDelay(this.distancesFromCenter[i]))

      // put it at its center position
      alignOnCurve(this.dummy, curve, 0.5)
      this.dummy.rotateZ(OPTIMAL_ROTATION)
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

    this.delaysFromPerimeter = this.normalizeDelays(this.delaysFromPerimeter)
    this.delaysFromCenter = this.normalizeDelays(this.delaysFromCenter)
    webgl.controls.$onChanges(({ delayFactor, spiralRadius }) => {
      if (delayFactor) {
        const delaysFromCenter = this.points.map((p, i) =>
          this.generateDelay(this.distancesFromCenter[i])
        )
        this.delaysFromCenter = this.normalizeDelays(delaysFromCenter)

        const delaysFromPerimeter = this.points.map((p, i) =>
          this.generateDelay(this.distancesFromPerimeter[i])
        )
        this.delaysFromPerimeter = this.normalizeDelays(delaysFromPerimeter)
      }
      if (spiralRadius) {
        this.points.forEach((point, i) => {
          const [x, y] = point
          const newPoints = this.generateCurve(x, y, 0)
          this.targetCurves[i].points = newPoints
          this.curves[i].points = newPoints.map(p => p.clone())

          // update also the curve points if they're visible
          if (window.DEBUG) {
            this.updateCurvePoints(this.curves[i])
          }
        })
      }
    })

    // put the animation at 0
    this.percentages.length = this.NUM_INSTANCES
    this.percentages.fill(0)

    // fill the rotations
    this.rotations = Array(this.NUM_INSTANCES).fill(0)
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

    const endZ = this.initialCameraZ * 2
    const startZ = endZ * -1

    for (let i = 0; i < segments; i++) {
      const currentZ = mapRange(i, 0, segments - 1, startZ, endZ)

      // how much to go from the tube to the final image, 0 is tube, 1 is final image
      const scaleAmount = mapRangeTriple(i, 0, halfIndex, segments - 1, 1, 0, 1)
      const scale = mapRange(eases.expoIn(1 - scaleAmount), 0, 1, 0, 1)

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

  getDistanceFromCenter(x, y) {
    const targetPosition = new THREE.Vector2(x, y)
    const distance = targetPosition.distanceTo(center)

    return distance
  }

  getDistanceFromPerimeter(x, y) {
    const targetPosition = new THREE.Vector2(x, y)
    const distance = targetPosition.distanceTo(center)

    return Math.hypot(this.width / 2, this.height / 2) - distance
  }

  generateDelay(distance) {
    const { delayFactor } = this.webgl.controls

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

  updateCurvePoints = curve => {
    if (!curve.mesh) {
      return
    }

    curve.points.forEach((p, j) => {
      const vertex = curve.mesh.geometry.vertices[j]
      vertex.copy(p)
    })
    curve.mesh.geometry.verticesNeedUpdate = true
  }

  update(dt, time) {
    const { displacement } = this.webgl.controls

    for (let i = 0; i < this.NUM_INSTANCES; i++) {
      const curve = this.curves[i]
      const targetCurve = this.targetCurves[i]
      const delay =
        this.targetPercentage === 0.5 ? this.delaysFromPerimeter[i] : this.delaysFromCenter[i]

      if (this.tStart !== undefined) {
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
        })

        // update the debug mode lines
        if (window.DEBUG) {
          this.updateCurvePoints(curve)
        }

        // rotate the leaves
        const { frequency, speed, amplitude, attenuation } = this.webgl.controls.turbulence
        const distance = this.distancesFromPerimeter[i]
        this.rotations[i] =
          impulseMultiple((distance + time * speed) * frequency, attenuation, 1) * amplitude
      }

      // align the box on the curve
      alignOnCurve(this.dummy, curve, this.percentages[i])

      // add the rotation effect
      const MAX_ROTATION_DISTANCE = 0.3 // how much distance from the middle the rotation has still effect
      const fromMiddle = Math.abs(this.percentages[i] - 0.5)
      if (fromMiddle < MAX_ROTATION_DISTANCE * 1.1) {
        const rotationAmount = eases.expoIn(
          mapRange(fromMiddle, 0, MAX_ROTATION_DISTANCE, 1, 0, true)
        )

        this.dummy.rotateZ(OPTIMAL_ROTATION * rotationAmount)
        this.dummy.rotateX(-this.rotations[i] * rotationAmount)
      }

      this.dummy.updateMatrix()
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix)
      this.instancedMesh.instanceMatrix.needsUpdate = true
    }
  }
}
