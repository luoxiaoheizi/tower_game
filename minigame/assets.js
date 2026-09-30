const IMAGES = [
  'background', 'hook', 'block-rope', 'block', 'block-perfect',
  'heart', 'main-index-title',
  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'
]

function loadImages(platform, progress, timeoutMs = 12000) {
  let loaded = 0
  const images = {}
  return Promise.all(IMAGES.map(name => new Promise((resolve, reject) => {
    let image
    let timer
    const finish = error => {
      clearTimeout(timer)
      if (image) { image.onload = null; image.onerror = null }
      if (error) return reject(new Error(`图片加载失败：${name}`))
      images[name] = image
      loaded += 1
      progress(loaded / IMAGES.length)
      resolve()
    }
    try {
      image = platform.createImage()
      timer = setTimeout(() => finish(true), timeoutMs)
      image.onload = () => finish(false)
      image.onerror = () => finish(true)
      image.src = `assets/${name}.png`
    } catch (error) { finish(true) }
  }))).then(() => images)
}

module.exports = { IMAGES, loadImages }
