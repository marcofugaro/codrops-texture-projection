import SimplexNoise from 'simplex-noise'
import Poisson from 'poisson-disk-sampling'

const simplex = new SimplexNoise()
export function noise(...args) {
  switch (args.length) {
    case 1:
      return simplex.noise2D(0, args[0])
    case 2:
      return simplex.noise2D(args[0], args[1])
    case 3:
      return simplex.noise3D(args[0], args[1], args[2])
    case 4:
      return simplex.noise3D(args[0], args[1], args[2], args[3])
    default:
      throw new Error(`Invalid number of arguments passed to the noise() function`)
  }
}

export function poisson(range) {
  // the poisson-disk-sampling library doesn't work well
  // with small numbers
  const scale = n => n * 1000
  const scaleInvert = n => n / 1000

  const rangeScaled = range.map(scale)
  const minUnit = Math.min(...rangeScaled)
  return new Poisson(rangeScaled, minUnit * 0.04, minUnit * 0.05, 10)
    .fill()
    .map(p => p.map(scaleInvert))
}
