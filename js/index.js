import State from 'controls-state'
import WebGLApp from './lib/WebGLApp'
import assets from './lib/AssetManager'
import { addLights } from './scene/lights'
import { Slides } from './scene/Slides'
import { SlideNoise } from './scene/SlideNoise'

window.DEBUG = window.location.search.includes('debug')

window.IS_MOBILE = window.matchMedia('(max-width: 53em)').matches

// grab our canvas
const canvas = document.querySelector('#app')

// setup the WebGLRenderer
const webgl = new WebGLApp({
  canvas,
  // set the scene background color to translarent
  alpha: true,
  backgroundAlpha: 0,
  orbitControls: window.DEBUG && { distance: 5 },
  controls: {
    color: '#9e9b94',
    // the interaction displacement
    displacement: new State.Slider(0.6, { min: 0, max: 2, step: 0.01 }),
    // how much there is between the first and the last to arrive
    delayFactor: new State.Slider(1.5, { min: 0, max: 10, step: 0.01 }),
    // the waving effect
    turbulence: {
      speed: new State.Slider(0.2, { min: 0, max: 3, step: 0.01 }),
      frequency: new State.Slider(0.5, { min: 0, max: 2, step: 0.01 }),
      amplitude: new State.Slider(0.2, { min: 0, max: 2, step: 0.01 }),
    },
  },
  closeControls: true,
  hideControls: window.IS_MOBILE,
  // fix the height on mobile
  height: window.IS_MOBILE ? 400 : undefined,
})

// attach it to the window to inspect in the console
if (window.DEBUG) {
  window.webgl = webgl
}

// hide canvas
webgl.canvas.style.visibility = 'hidden'

const IMAGES = ['images/1.jpeg', 'images/2.jpeg', 'images/3.jpeg', 'images/4.jpeg']

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

  addLights(webgl)

  // add any "WebGL components" here...
  // append them to the scene so you can
  // use them from other components easily
  webgl.scene.slides = new Slides(webgl, { firstImage, otherImages: IMAGES, Slide: SlideNoise })
  webgl.scene.add(webgl.scene.slides)

  // start animation loop
  webgl.start()
  webgl.draw()
})
