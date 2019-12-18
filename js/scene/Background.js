import * as THREE from 'three'
import { monkeyPatch } from '../lib/three-utils'

const PLANE_WIDTH = 21

export class Background extends THREE.Group {
  constructor(webgl, options) {
    super(options)
    this.webgl = webgl
    this.options = options

    const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_WIDTH)
    const material = new THREE.ShaderMaterial({
      lights: true,
      uniforms: {
        ...THREE.ShaderLib['lambert'].uniforms,
        color: { value: new THREE.Color(webgl.controls.background) },
      },
      vertexShader: monkeyPatch(THREE.ShaderChunk['meshlambert_vert'], {
        header: `
          varying vec2 vUv;
        `,
        '#include <uv_vertex>': `
          vUv = uv;
        `,
      }),
      fragmentShader: monkeyPatch(THREE.ShaderChunk['meshlambert_frag'], {
        header: `
          varying vec2 vUv;
          uniform vec3 color;
        `,
        'vec4 diffuseColor = vec4( diffuse, opacity );': `
          float distance = length(vec2(0.5) - vUv);
          vec3 centerColor = mix(color, vec3(1.0), 0.5);
          vec3 outColor = mix(centerColor, color, min(distance * 2.0, 1.0));
          vec4 diffuseColor = vec4(outColor, opacity);
        `,
      }),
    })
    webgl.controls.$onChanges(({ background }) => {
      if (background) {
        material.uniforms.color.value = new THREE.Color(background.value)
      }
    })
    const background = new THREE.Mesh(geometry, material)
    background.position.z = -8
    background.rotateZ(Math.PI)
    this.add(background)
  }
}
