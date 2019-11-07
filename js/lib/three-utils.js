import * as THREE from 'three'

// from https://stackoverflow.com/questions/11179327/orient-objects-rotation-to-a-spline-point-tangent-in-three-js
export function alignOnCurve(object, curve, percentage) {
  // set the object position
  const point = curve.getPoint(percentage)
  object.position.copy(point)

  // get the tangent to the curve
  const tangent = curve.getTangent(percentage).normalize()

  // calculate the axis to rotate around
  const up = new THREE.Vector3(0, 1, 0)
  const axis = new THREE.Vector3().crossVectors(up, tangent).normalize()

  // calcluate the angle between the up vector and the tangent
  const radians = Math.acos(up.dot(tangent))

  // set the quaternion
  object.quaternion.setFromAxisAngle(axis, radians)
}

// from https://discourse.threejs.org/t/functions-to-calculate-the-visible-width-height-at-a-given-z-depth-from-a-perspective-camera/269
export function visibleHeightAtZDepth(depth, camera) {
  // compensate for cameras not positioned at z=0
  const cameraOffset = camera.position.z
  if (depth < cameraOffset) {
    depth -= cameraOffset
  } else {
    depth += cameraOffset
  }

  // vertical fov in radians
  const vFOV = (camera.fov * Math.PI) / 180

  // Math.abs to ensure the result is always positive
  return 2 * Math.tan(vFOV / 2) * Math.abs(depth)
}

export function visibleWidthAtZDepth(depth, camera) {
  const height = visibleHeightAtZDepth(depth, camera)
  return height * camera.aspect
}

export function monkeyPatch(shader, { header = '', main = '', ...replaces }) {
  let patchedShader = shader

  Object.keys(replaces).forEach(key => {
    patchedShader = patchedShader.replace(key, replaces[key])
  })

  return patchedShader.replace(
    'void main() {',
    `
    ${header}
    void main() {
      ${main}
    `
  )
}
