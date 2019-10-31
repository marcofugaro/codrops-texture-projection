import * as THREE from 'three'

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
