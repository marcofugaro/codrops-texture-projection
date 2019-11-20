import * as THREE from 'three'
import assets from '../lib/AssetManager'
import { Slide } from './Slide'

// how much the animation of a single box lasts
export const ANIMATION_DURATION = 1.5 // seconds

// how much to wait until the animation of the next slides starts
export const SLIDES_INTERVAL = 1.5 // seconds

const IMAGES = [
  'images/adult-beautiful-bikini-blue-pexels.jpg',
  'images/christopher-campbell2-unsplash.jpg',
  'images/tyler-nix-unsplash.jpg',
]

// preload the first texture
const image1 = assets.queue({
  url: IMAGES.shift(),
  type: 'texture',
})

export class Slides extends THREE.Group {
  slides = []
  slideIndex = 0

  constructor(webgl, options) {
    super(options)
    this.webgl = webgl

    // initialize the first slide components
    this.initSlide(image1)

    // and initialize the other once they're loaded
    IMAGES.forEach(image => {
      assets
        .loadSingle({
          url: image,
          type: 'texture',
          renderer: webgl.renderer,
        })
        .then(this.initSlide)
    })

    // make the first one enter
    setTimeout(() => {
      this.slides[this.slideIndex].enter()
    }, 16)

    // change slides on the prev/next button click
    // TODO disable the button when the animation is playing or something
    const prevButton = document.querySelector('.content__prev')
    const nextButton = document.querySelector('.content__next')

    prevButton.addEventListener('click', () => {
      this.slides[this.slideIndex].exitReversed()
      this.slideIndex = (this.slideIndex - 1 + this.slides.length) % this.slides.length
      setTimeout(() => {
        this.slides[this.slideIndex].enterReversed()
      }, SLIDES_INTERVAL * 1000)
    })

    nextButton.addEventListener('click', () => {
      this.slides[this.slideIndex].exit()
      this.slideIndex = (this.slideIndex + 1) % this.slides.length
      setTimeout(() => {
        this.slides[this.slideIndex].enter()
      }, SLIDES_INTERVAL * 1000)
    })
  }

  initSlide = image => {
    const texture = assets.get(image)
    const slide = new Slide(this.webgl, { texture })
    this.add(slide)
    this.slides.push(slide)
  }
}
