import * as THREE from 'three'
import lambertVert from 'three/src/renderers/shaders/ShaderLib/meshlambert_vert.glsl'
import lambertFrag from 'three/src/renderers/shaders/ShaderLib/meshlambert_frag.glsl'
import { monkeyPatch } from '../lib/three-utils'

// TODO make this responsive
const PLANE_WIDTH = 21

export class Background extends THREE.Group {
  constructor(webgl, options) {
    super(options)
    this.webgl = webgl

    const geometry = new THREE.CylinderGeometry(4, 4, 2, 64)
    const material = new THREE.MeshLambertMaterial({
      color: webgl.controls.foreground,
    })
    webgl.controls.$onChanges(({ foreground }) => {
      if (foreground) {
        material.color = new THREE.Color(foreground.value)
      }
    })
    const cylinder = new THREE.Mesh(geometry, material)
    cylinder.position.y = -3
    cylinder.position.z = -4
    cylinder.receiveShadow = true
    this.add(cylinder)

    const geometry2 = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_WIDTH)
    const material2 = new THREE.ShaderMaterial({
      lights: true,
      uniforms: {
        ...THREE.ShaderLib['lambert'].uniforms,
        color: { value: new THREE.Color(webgl.controls.background) },
      },
      vertexShader: monkeyPatch(lambertVert, {
        header: `
          varying vec2 vUv;
        `,
        '#include <uv_vertex>': `
          vUv = uv;
        `,
      }),
      fragmentShader: monkeyPatch(lambertFrag, {
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
        material2.uniforms.color.value = new THREE.Color(background.value)
      }
    })
    const wall = new THREE.Mesh(geometry2, material2)
    wall.position.z = -8
    wall.rotateZ(Math.PI)
    this.add(wall)
  }
}
