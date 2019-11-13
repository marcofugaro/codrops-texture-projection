import * as THREE from 'three'
import lambertVert from 'three/src/renderers/shaders/ShaderLib/meshlambert_vert.glsl'
import lambertFrag from 'three/src/renderers/shaders/ShaderLib/meshlambert_frag.glsl'
import { monkeyPatch } from './three-utils'

export class ProjectedMaterial extends THREE.ShaderMaterial {
  isProjectedMaterial = true

  // TODO implement cover: true
  constructor({ camera, texture, color = 0xffffff, textureScale = 1, instanced = false } = {}) {
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
        header: [
          instanced
            ? `
            attribute vec4 savedModelMatrix0;
            attribute vec4 savedModelMatrix1;
            attribute vec4 savedModelMatrix2;
            attribute vec4 savedModelMatrix3;
            `
            : `
            uniform mat4 savedModelMatrix;
          `,
          `
          uniform mat4 viewMatrixCamera;
          uniform mat4 projectionMatrixCamera;
          uniform mat4 modelMatrixCamera;

          varying vec4 vWorldPosition;
          varying vec3 vNormal;
          varying vec4 vTexCoords;
          `,
        ].join(''),
        main: [
          instanced
            ? `
            mat4 savedModelMatrix = mat4(
              savedModelMatrix0,
              savedModelMatrix1,
              savedModelMatrix2,
              savedModelMatrix3
            );
            `
            : '',
          `
          vNormal = mat3(savedModelMatrix) * normal;
          vWorldPosition = savedModelMatrix * vec4(position, 1.0);
          vTexCoords = projectionMatrixCamera * viewMatrixCamera * vWorldPosition;
          `,
        ].join(''),
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


          // TODO don't pass those as uniforms to avoid branching, or maybe do these calculations in js
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
}

export function project(mesh) {
  if (!mesh.material.isProjectedMaterial) {
    throw new Error(`The mesh material must be a ProjectedMaterial`)
  }

  // make sure the matrix is updated
  mesh.updateMatrixWorld()

  // we save the object model matrix so it's projected relative
  // to that position, like a snapshot
  mesh.material.uniforms.savedModelMatrix.value.copy(mesh.modelMatrix)
}

export function projectInstanceAt(index, instancedMesh, matrixWorld) {
  if (!instancedMesh.isInstancedMesh) {
    throw new Error(`The provided mesh is not an InstancedMesh`)
  }

  if (!instancedMesh.material.isProjectedMaterial) {
    throw new Error(`The InstancedMesh material must be a ProjectedMaterial`)
  }

  if (
    !instancedMesh.geometry.attributes.savedModelMatrix0 ||
    !instancedMesh.geometry.attributes.savedModelMatrix1 ||
    !instancedMesh.geometry.attributes.savedModelMatrix2 ||
    !instancedMesh.geometry.attributes.savedModelMatrix3
  ) {
    throw new Error(``)
  }

  instancedMesh.geometry.attributes.savedModelMatrix0.setXYZW(
    index,
    matrixWorld.elements[0],
    matrixWorld.elements[1],
    matrixWorld.elements[2],
    matrixWorld.elements[3]
  )
  instancedMesh.geometry.attributes.savedModelMatrix1.setXYZW(
    index,
    matrixWorld.elements[4],
    matrixWorld.elements[5],
    matrixWorld.elements[6],
    matrixWorld.elements[7]
  )
  instancedMesh.geometry.attributes.savedModelMatrix2.setXYZW(
    index,
    matrixWorld.elements[8],
    matrixWorld.elements[9],
    matrixWorld.elements[10],
    matrixWorld.elements[11]
  )
  instancedMesh.geometry.attributes.savedModelMatrix3.setXYZW(
    index,
    matrixWorld.elements[12],
    matrixWorld.elements[13],
    matrixWorld.elements[14],
    matrixWorld.elements[15]
  )
}

export function allocateProjectionData(geometry, instancesCount) {
  geometry.addAttribute(
    'savedModelMatrix0',
    new THREE.InstancedBufferAttribute(new Float32Array(instancesCount * 4), 4)
  )
  geometry.addAttribute(
    'savedModelMatrix1',
    new THREE.InstancedBufferAttribute(new Float32Array(instancesCount * 4), 4)
  )
  geometry.addAttribute(
    'savedModelMatrix2',
    new THREE.InstancedBufferAttribute(new Float32Array(instancesCount * 4), 4)
  )
  geometry.addAttribute(
    'savedModelMatrix3',
    new THREE.InstancedBufferAttribute(new Float32Array(instancesCount * 4), 4)
  )
}
