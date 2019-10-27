import * as THREE from 'three'

export class ProjectedMaterial extends THREE.ShaderMaterial {
  constructor({ camera, texture, color } = {}) {
    // make sure it's updated
    camera.updateMatrixWorld()

    // get the matrices from the camera so they're fixed in camera's original position
    const projectionMatrix = camera.projectionMatrix.clone()
    const viewMatrix = camera.matrixWorldInverse.clone()
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
    projectorMatrix.multiply(projectionMatrix)
    projectorMatrix.multiply(viewMatrix)

    super({
      uniforms: {
        tex: { type: 't', value: texture },
        projectorMatrix: { type: 'mat4', value: projectorMatrix },
        savedModelMatrix: { type: 'mat4', value: new THREE.Matrix4() },
        modelMatrixCamera: { type: 'mat4', value: modelMatrixCamera },
      },
      vertexShader: `
    uniform mat4 projectorMatrix;
    uniform mat4 savedModelMatrix;
uniform mat4 modelMatrixCamera;

    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec4 vProjectorCoords;
varying vec4 vSomething;

    void main() {
      vPosition = position;
      vNormal = mat3(savedModelMatrix) * normal;

      vec4 worldPosition = savedModelMatrix * vec4(position, 1.0);
      vProjectorCoords = projectorMatrix * worldPosition;

vSomething = modelMatrixCamera * vec4(position, 1.0);

      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
      fragmentShader: `
    uniform sampler2D tex;
    uniform vec2 resolution;

    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec4 vProjectorCoords;
varying vec4 vSomething;

    void main() {
      // this is screen space texture projection
      // vec2 texCoord = gl_FragCoord.xy / resolution;
      // vec4 texColor = texture2D(tex, texCoord);

      // transform it into clip-space coordinates
      vec3 projectorCoords = vProjectorCoords.xyz / vProjectorCoords.w;

      vec4 texColor = texture2D(tex, projectorCoords.xy);


      // this makes sure we don't sample out of the texture
      // TODO handle alpha of some value
      bool inTexture = all(lessThan(abs(projectorCoords * 2. - 1.), vec3(1.0))) && (texColor.a > 0.);
      texColor = inTexture ? texColor : vec4(0.0);

      // this makes sure we don't render also the back of the object
      vec3 projectorDirection = normalize(vSomething.xyz - vPosition);
      float dotProduct = dot(vNormal, projectorDirection);
      vec4 color = dotProduct >= 0.0 ? texColor : vec4(1.0);

      // color = vec4((vNormal), 1.0);
      gl_FragColor = color;
    }

  `,
    })
  }

  project(modelMatrix) {
    this.uniforms.savedModelMatrix.value.copy(modelMatrix)
  }
}
