import * as THREE from 'three'
import lambertVert from 'three/src/renderers/shaders/ShaderLib/meshlambert_vert.glsl'
import lambertFrag from 'three/src/renderers/shaders/ShaderLib/meshlambert_frag.glsl'
import { monkeyPatch } from './three-utils'

export class ProjectedMaterial extends THREE.ShaderMaterial {
  // TODO implement cover: true
  constructor({ camera, texture, color = 0xffffff, textureScale } = {}) {
    // make sure the camera matrices are updated
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    camera.updateWorldMatrix()

    // get the matrices from the camera so they're fixed in camera's original position
    const viewMatrixCamera = camera.matrixWorldInverse.clone()
    const projectionMatrixCamera = camera.projectionMatrix.clone()
    const modelMatrixCamera = camera.matrixWorld.clone()

    const projPosition = camera.position.clone()

    const ratio = texture.image.naturalWidth / texture.image.naturalHeight

    const ratioCamera = camera.aspect

    super({
      lights: true,
      uniforms: {
        ...THREE.ShaderLib['lambert'].uniforms,
        baseColor: { value: new THREE.Color(color) },
        viewMatrixCamera: { type: 'm4', value: viewMatrixCamera },
        projectionMatrixCamera: { type: 'm4', value: projectionMatrixCamera },
        modelMatrixCamera: { type: 'mat4', value: modelMatrixCamera },
        // we will set this later when we will have positioned the object
        savedModelMatrix: { type: 'mat4', value: new THREE.Matrix4() },
        texture: { value: texture },
        projPosition: { type: 'v3', value: projPosition },
        ratio: { value: ratio },
        ratioCamera: { value: ratioCamera },
        textureScale: { value: textureScale },
      },

      vertexShader: monkeyPatch(lambertVert, {
        header: `
          uniform mat4 viewMatrixCamera;
          uniform mat4 projectionMatrixCamera;
          uniform mat4 modelMatrixCamera;
          uniform mat4 savedModelMatrix;

          varying vec4 vWorldPosition;
          varying vec3 vNormal;
          varying vec4 vTexCoords;
        `,
        main: `
          vNormal = mat3(savedModelMatrix) * normal;
          vWorldPosition = savedModelMatrix * vec4(position, 1.0);
          vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;
        `,
      }),

      fragmentShader: monkeyPatch(lambertFrag, {
        header: `
          uniform vec3 baseColor;
          uniform sampler2D texture;
          uniform vec3 projPosition;
          uniform float ratio;
          uniform float ratioCamera;
          uniform float textureScale;

          varying vec3 vNormal;
          varying vec4 vWorldPosition;
          varying vec4 vTexCoords;

          float map(float value, float min1, float max1, float min2, float max2) {
            return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
          }
        `,
        'vec4 diffuseColor = vec4( diffuse, opacity );': `
          vec2 uv = (vTexCoords.xy / vTexCoords.w) * 0.5 + 0.5;


          // keep the image proportions and apply textureScale
          float widthCamera = 1.0;
          float heightCamera = widthCamera * (1.0 / ratioCamera);
          if (ratio < 1.0) {
            float width = heightCamera * ratio;
            float widthPercent = 1.0 / (width / widthCamera * textureScale);
            uv.x = map(uv.x, 0.0, 1.0, 0.5 - widthPercent / 2.0, 0.5 + widthPercent / 2.0);
            float heightPercent = 1.0 / textureScale;
            uv.y = map(uv.y, 0.0, 1.0, 0.5 - heightPercent / 2.0, 0.5 + heightPercent / 2.0);
          } else {
            float height = widthCamera * (1.0 / ratio);
            float heightPercent = 1.0 / ((height / heightCamera) * 0.5);
            uv.y = map(uv.y, 0.0, 1.0, 0.5 - heightPercent / 2.0, 0.5 + heightPercent / 2.0);
            float widthPercent = 1.0 / textureScale;
            uv.x = map(uv.x, 0.0, 1.0, 0.5 - widthPercent / 2.0, 0.5 + widthPercent / 2.0);
          }

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

          // TODO handle opacity
          // vec4 diffuseColor = vec4( diffuse, opacity );
          vec4 diffuseColor = color;
        `,
      }),
    })

    // listen on resize if the camera used for the projection
    // is the same used to render.
    // do this on window resize because there is no way to
    // listen for the resize of the renderer
    window.addEventListener('resize', () => {
      this.uniforms.projectionMatrixCamera.value.copy(camera.projectionMatrix)
      this.uniforms.ratioCamera.value = camera.aspect
    })
  }

  project(modelMatrix) {
    // we save the object model matrix so it's projected relative
    // to that position, like a snapshot
    this.uniforms.savedModelMatrix.value.copy(modelMatrix)
  }
}
