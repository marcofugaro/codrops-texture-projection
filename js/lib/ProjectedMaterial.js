import * as THREE from 'three'

export class ProjectedMaterial extends THREE.ShaderMaterial {
  constructor({ camera, texture, color = 0xffffff } = {}) {
    // make sure the camera matrices are updated
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    camera.updateWorldMatrix()

    // get the matrices from the camera so they're fixed in camera's original position
    const projectionMatrixCamera = camera.projectionMatrix.clone()
    const viewMatrixCamera = camera.matrixWorldInverse.clone()
    const modelMatrixCamera = camera.matrixWorld.clone()

    // from https://github.com/mrdoob/three.js/blob/ad7679477e5debbf2a8e3e274e517888e25adead/src/lights/LightShadow.js
    const projectorMatrix = new THREE.Matrix4()
    projectorMatrix.set(
      0.5,
      0.0,
      0.0,
      0.5,
      0.0,
      0.5,
      0.0,
      0.5,
      0.0,
      0.0,
      0.5,
      0.5,
      0.0,
      0.0,
      0.0,
      1.0
    )
    projectorMatrix.multiply(projectionMatrixCamera)
    projectorMatrix.multiply(viewMatrixCamera)

    super({
      uniforms: {
        tex: { type: 't', value: texture },
        color: { type: 'c', value: new THREE.Color(color) },
        projectorMatrix: { type: 'mat4', value: projectorMatrix },
        // we will set this later when we will have positioned the object
        objectModelMatrix: { type: 'mat4', value: new THREE.Matrix4() },
        modelMatrixCamera: { type: 'mat4', value: modelMatrixCamera },
      },
      vertexShader: `
        uniform mat4 projectorMatrix;
        uniform mat4 objectModelMatrix;
        uniform mat4 modelMatrixCamera;

        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec4 vProjectorCoords;
        varying vec4 vProjectionPosition;

        void main() {
          vPosition = position;
          vNormal = mat3(objectModelMatrix) * normal;

          vec4 worldPosition = objectModelMatrix * vec4(position, 1.0);
          vProjectorCoords = projectorMatrix * worldPosition;
          vProjectionPosition = modelMatrixCamera * vec4(position, 1.0);

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tex;
        uniform vec3 color;

        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec4 vProjectorCoords;
        varying vec4 vProjectionPosition;

        void main() {
          // this is screen space texture projection
          // vec2 texCoord = gl_FragCoord.xy / resolution;
          // vec4 outColor = texture2D(tex, texCoord);

          // transform it into clip-space coordinates
          vec3 projectorCoords = vProjectorCoords.xyz / vProjectorCoords.w;
          vec4 outColor = texture2D(tex, projectorCoords.xy);

          // this makes sure we don't sample out of the texture
          // TODO handle alpha of some value
          bool inTexture = all(lessThan(abs(projectorCoords * 2. - 1.), vec3(1.0))) && (outColor.a > 0.);
          if (!inTexture) {
            outColor = vec4(color, 1.0);
          }

          // this makes sure we don't render also the back of the object
          vec3 projectorDirection = normalize(vProjectionPosition.xyz - vPosition);
          float dotProduct = dot(vNormal, projectorDirection);
          if (dotProduct < 0.0) {
            outColor = vec4(color, 1.0);
          }

          gl_FragColor = outColor;
        }
      `,
    })
  }

  project(modelMatrix) {
    this.uniforms.objectModelMatrix.value.copy(modelMatrix)
  }
}
