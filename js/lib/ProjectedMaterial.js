import * as THREE from 'three'

export class ProjectedMaterial extends THREE.ShaderMaterial {
  constructor({ camera, texture, color = 0xffffff } = {}) {
    // make sure the camera matrices are updated
    // camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    // camera.updateWorldMatrix()

    // get the matrices from the camera so they're fixed in camera's original position
    const viewMatrixCamera = camera.matrixWorldInverse.clone()
    const projectionMatrixCamera = camera.projectionMatrix.clone()
    const modelMatrixCamera = camera.matrixWorld.clone()

    const projPosition = camera.position.clone()

    super({
      uniforms: {
        baseColor: { value: new THREE.Color(color) },
        viewMatrixCamera: { type: 'm4', value: viewMatrixCamera },
        projectionMatrixCamera: { type: 'm4', value: projectionMatrixCamera },
        modelMatrixCamera: { type: 'mat4', value: modelMatrixCamera },
        // we will set this later when we will have positioned the object
        savedModelMatrix: { type: 'mat4', value: new THREE.Matrix4() },
        texture: { value: texture },
        projPosition: { type: 'v3', value: projPosition },
      },

      vertexShader: `
        uniform mat4 viewMatrixCamera;
        uniform mat4 projectionMatrixCamera;
        uniform mat4 modelMatrixCamera;
        uniform mat4 savedModelMatrix;

        varying vec4 vWorldPosition;
        varying vec3 vNormal;
        varying vec4 vTexCoords;

        void main() {
          vNormal = mat3(savedModelMatrix) * normal;
          vWorldPosition = savedModelMatrix * vec4(position, 1.0);
          vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,

      fragmentShader: `
        uniform vec3 baseColor;
        uniform sampler2D texture;
        uniform vec3 projPosition;

        varying vec3 vNormal;
        varying vec4 vWorldPosition;
        varying vec4 vTexCoords;

        void main() {
          vec2 uv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;
          vec4 color = texture2D(texture, uv);

          // this makes sure we don't sample out of the texture
          // TODO handle alpha
          bool inTexture = (max(uv.x, uv.y) <= 1.0 && min(uv.x, uv.y) >= 0.0);
          if (!inTexture) {
            color = vec4(baseColor, 1.0);
          }

          // this makes sure we don't render also the back of the object
          vec3 projectorDirection = normalize(projPosition - vWorldPosition.xyz);
          float dotProduct = dot(vNormal, projectorDirection);
          if (dotProduct < 0.0) {
            color = vec4(baseColor, 1.0);
          }

          // color = vec4(vec3(dotProduct), 1.0);
          gl_FragColor = color;
        }
      `,
    })
  }

  project(modelMatrix) {
    // we save the object model matrix so it's projected relative
    // to that position, like a snapshot
    this.uniforms.savedModelMatrix.value.copy(modelMatrix)
  }
}
