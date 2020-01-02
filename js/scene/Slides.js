import * as THREE from 'three'
import assets from '../lib/AssetManager'

// how much to wait until the animation of the next slides starts
export const SLIDES_INTERVAL = 0.8 // seconds

export class Slides extends THREE.Group {
  slides = []
  slideIndex = 0

  constructor(webgl, options) {
    super(options)
    this.webgl = webgl
    this.options = options

    const { firstImage, otherImages } = this.options

    // initialize the first slide components
    this.initSlide(firstImage)

    // and initialize the other once they're loaded
    otherImages.forEach(image => {
      assets
        .loadSingle({
          url: image,
          type: 'texture',
          renderer: webgl.renderer,
        })
        .then(this.initSlide)
    })

    // make the first one enter
    this.slides[this.slideIndex].animateTo(0.5)

    // change slides on the prev/next button click
    const prevButton = document.querySelector('.frame__prev')
    const nextButton = document.querySelector('.frame__next')

    prevButton.addEventListener('click', () => {
      this.slides[this.slideIndex].animateTo(0)
      this.slideIndex = (this.slideIndex - 1 + this.slides.length) % this.slides.length
      this.slides[this.slideIndex].moveTo(1)
      setTimeout(() => {
        this.slides[this.slideIndex].animateTo(0.5)
      }, SLIDES_INTERVAL * 1000)
    })

    nextButton.addEventListener('click', () => {
      this.slides[this.slideIndex].animateTo(1)
      this.slideIndex = (this.slideIndex + 1) % this.slides.length
      this.slides[this.slideIndex].moveTo(0)
      setTimeout(() => {
        this.slides[this.slideIndex].animateTo(0.5)
      }, SLIDES_INTERVAL * 1000)
    })
  }

  initSlide = image => {
    const { Slide } = this.options

    const texture = assets.get(image)
    const slide = new Slide(this.webgl, { texture })
    this.add(slide)
    this.slides.push(slide)
  }
}
