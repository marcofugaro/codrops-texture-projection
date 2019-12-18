import * as THREE from 'three'
import State from 'controls-state'
import chroma from 'chroma-js'
import WebGLApp from './lib/WebGLApp'
import assets from './lib/AssetManager'
import { addLights } from './scene/lights'
import { Slides } from './scene/Slides'
import { Background } from './scene/Background'
import { ForegroundSphere } from './scene/ForegroundSphere'
import { SlideSine } from './scene/SlideSine'

window.DEBUG = window.location.search.includes('debug')

const BACKGROUND = '#9D7F00'
const FOREGROUND = '#C93230'
const OBJECT_COLOR = '#87320F'

const IS_MOBILE = window.matchMedia('(max-width: 53em)').matches

// grab our canvas
const canvas = document.querySelector('#app')

// setup the WebGLRenderer
const webgl = new WebGLApp({
  canvas,
  // set the scene background color
  background: chroma(BACKGROUND)
    .brighten(0.7)
    .saturate()
    .hex(),
  // show the fps counter from stats.js
  showFps: window.DEBUG,
  orbitControls: window.DEBUG && { distance: 5 },
  controls: {
    color: OBJECT_COLOR,
    background: BACKGROUND,
    foreground: FOREGROUND,
    // the interaction displacement
    displacement: new State.Slider(0.5, { min: 0, max: 2, step: 0.01 }),
    // how much there is between the first and the last to arrive
    delayFactor: new State.Slider(1.3, { min: 0, max: 5, step: 0.01 }),
    // the waving effect
    turbulence: {
      speed: new State.Slider(1.3, { min: 0, max: 15, step: 0.01 }),
      frequency: new State.Slider(0.8, { min: 0, max: 2, step: 0.01 }),
      amplitude: new State.Slider(0.25, { min: 0, max: 4, step: 0.01 }),
      attenuation: new State.Slider(1.3, { min: 0, max: 3, step: 0.01 }),
    },
  },
  // fix the height on mobile
  height: IS_MOBILE ? 450 : undefined,
})

// attach it to the window to inspect in the console
if (window.DEBUG) {
  window.webgl = webgl
}

// hide canvas
webgl.canvas.style.visibility = 'hidden'

const IMAGES = [
  'images/sweets/dilyara-garifullina-unsplash.jpg',
  'images/sweets/jennifer-pallian-unsplash.jpg',
  'images/sweets/kharytonova-antonina-unsplash.jpg',
]

// preload the first texture
const firstImage = assets.queue({
  url: IMAGES.shift(),
  type: 'texture',
})

// load any queued assets
assets.load({ renderer: webgl.renderer }).then(() => {
  // show canvas
  webgl.canvas.style.visibility = ''

  // move the camera behind
  webgl.camera.position.set(0, 0, 5)

  addLights(webgl, { position: new THREE.Vector3(0, 10, 20) })

  // add any "WebGL components" here...
  // append them to the scene so you can
  // use them from other components easily
  webgl.scene.slides = new Slides(webgl, { firstImage, otherImages: IMAGES, Slide: SlideSine })
  webgl.scene.add(webgl.scene.slides)
  webgl.scene.bg = new Background(webgl)
  webgl.scene.add(webgl.scene.bg)
  webgl.scene.foreground = new ForegroundSphere(webgl)
  webgl.scene.add(webgl.scene.foreground)

  // start animation loop
  webgl.start()
  webgl.draw()
})
