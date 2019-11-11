import * as THREE from 'three'
import WebGLApp from './lib/WebGLApp'
import assets from './lib/AssetManager'
import { addLights } from './scene/lights'
import { Slides } from './scene/Slides'

window.DEBUG = window.location.search.includes('debug')

// grab our canvas
const canvas = document.querySelector('#app')

// setup the WebGLRenderer
const webgl = new WebGLApp({
  canvas,
  // set the scene background color
  background: '#111111',
  // show the fps counter from stats.js
  showFps: window.DEBUG,
  orbitControls: window.DEBUG && { distance: 5 },
  controls: {
    background: '#111111',
    materialColor: '#222222',
  },
  hideControls: !window.DEBUG,
})

// attach it to the window to inspect in the console
if (window.DEBUG) {
  window.webgl = webgl
}

// hide canvas
webgl.canvas.style.visibility = 'hidden'

// load any queued assets
assets.load({ renderer: webgl.renderer }).then(() => {
  // show canvas
  webgl.canvas.style.visibility = ''

  // move the camera behind
  webgl.camera.position.set(0, 0, 5)

  addLights(webgl)

  // add any "WebGL components" here...
  // append them to the scene so you can
  // use them from other components easily
  webgl.scene.slides = new Slides({ webgl })
  webgl.scene.add(webgl.scene.slides)

  // TODO remove this
  webgl.controls.$onChanges(() => {
    webgl.renderer.setClearColor(webgl.controls.background, 1)

    webgl.scene.slides.slide.boxes.forEach(box => {
      box.material.uniforms.baseColor.value = new THREE.Color(webgl.controls.materialColor)
    })
  })

  // start animation loop
  webgl.start()
  webgl.draw()
})
