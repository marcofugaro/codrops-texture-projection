import * as THREE from 'three'
import assets from '../lib/AssetManager'
import { Slide } from './Slide'

// how much the animation of a single box lasts
export const ANIMATION_DURATION = 1.5 // seconds

// how much to wait until the animation of the next slides starts
export const SLIDES_INTERVAL = 1.5 // seconds

// preload the textures
// TODO preload only the first one
const image1 = assets.queue({
  url: 'images/justin-essah-unsplash.jpg',
  type: 'texture',
})
const image2 = assets.queue({
  url: 'images/j-e-s-u-s-r-o-c-h-a-unsplash.jpg',
  type: 'texture',
})

export class Slides extends THREE.Group {
  slides = []
  slideIndex = 0

  constructor({ webgl, ...options }) {
    super(options)
    this.webgl = webgl

    const images = [image1, image2]

    images.forEach(image => {
      const texture = assets.get(image)
      const slide = new Slide({ texture, webgl })
      this.add(slide)
      this.slides.push(slide)
    })

    setTimeout(() => {
      this.slides[this.slideIndex].enter()
    }, 0)

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
}
