import State from 'controls-state'
import WebGLApp from './lib/WebGLApp'
import assets from './lib/AssetManager'
import { addSpotLight } from './scene/spotLight'
import { Slides } from './scene/Slides'
import { Background } from './scene/Background'
import { SlideSpiral } from './scene/SlideSpiral'

window.DEBUG = window.location.search.includes('debug')

// grab our canvas
const canvas = document.querySelector('#app')

// setup the WebGLRenderer
const webgl = new WebGLApp({
  canvas,
  // set the scene background color
  // TODO put this in a constant or somehitng
  background: '#5fb8d5',
  // show the fps counter from stats.js
  showFps: true, // window.DEBUG,
  orbitControls: window.DEBUG && { distance: 5 },
  controls: {
    // TODO put this in a constant or somehitng
    color: '#3698D5',
    background: '#5fb8d5',
    // the interaction displacement
    displacement: new State.Slider(0.5, { min: 0, max: 2, step: 0.01 }),
    // how much there is between the first and the last to arrive
    delayFactor: new State.Slider(1.3, { min: 0, max: 5, step: 0.01 }),
    // how big is the spiral
    spiralRadius: new State.Slider(0.8, { min: 0, max: 3, step: 0.01 }),
    // the waving effect
    turbulence: {
      speed: new State.Slider(1.3, { min: 0, max: 10, step: 0.01 }),
      frequency: new State.Slider(0.8, { min: 0, max: 10, step: 0.01 }),
      amplitude: new State.Slider(0.25, { min: 0, max: 3, step: 0.01 }),
      attenuation: new State.Slider(1.3, { min: 0, max: 3, step: 0.01 }),
    },
  },
})

// attach it to the window to inspect in the console
if (window.DEBUG) {
  window.webgl = webgl
}

// hide canvas
webgl.canvas.style.visibility = 'hidden'

const IMAGES = [
  'images/adult-beautiful-bikini-blue-pexels.jpg',
  'images/christopher-campbell2-unsplash.jpg',
  'images/tyler-nix-unsplash.jpg',
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

  addSpotLight(webgl)

  // add any "WebGL components" here...
  // append them to the scene so you can
  // use them from other components easily
  webgl.scene.slides = new Slides(webgl, { firstImage, otherImages: IMAGES, Slide: SlideSpiral })
  webgl.scene.add(webgl.scene.slides)
  webgl.scene.background = new Background(webgl)
  webgl.scene.add(webgl.scene.background)

  // start animation loop
  webgl.start()
  webgl.draw()
})
