/* turtles all the way down -- by chromakode (http://chromakode.com) */

function log(n, b) {
  return Math.log(n) / Math.log(b)
}


function choice(list) {
  return list[Math.floor(Math.random() * list.length)]
}


var imgsEndpoint = location.protocol == 'https:'
  ? 'https://sslimgs.xkcd.com/'
  : 'http://imgs.xkcd.com/'


function NArray(type/*, dims ... */) {
  this.dims = Array.prototype.slice.call(arguments, 1)
  this.offsets = []

  var size = 1
  for (var i = 0; i < this.dims.length; i++) {
    this.offsets.push(size)
    size *= this.dims[i]
  }

  this.data = new type(size)
}

NArray.prototype.idx = function(dims) {
  var idx = 0
  for (var i = 0; i < dims.length; i++) {
    idx += this.offsets[i] * dims[i]
  }
  return idx
}

NArray.prototype.get = function(dims) {
  return this.data[this.idx(dims)]
}

NArray.prototype.set = function(dims, value) {
  return this.data[this.idx(dims)] = value
}

NArray.prototype.setLinear = function(idx, value) {
  return this.data[idx] = value
}


function ImgCache() {
  this.imgs = {}
  this.callbacks = {}
}

ImgCache.prototype.get = function(src, callback) {
  var img = this.imgs[src]

  if (img == null) {
    this.imgs[src] = true
    this.callbacks[src] = [callback]
    var img = new Image()

    img.onload = function() {
      this.imgs[src] = img
      for (var i = 0; i < this.callbacks[src].length; i++) {
        var callback = this.callbacks[src][i]
        callback && callback(img)
      }
      delete this.callbacks[src]
    }.bind(this)
    img.crossOrigin = 'anonymous'
    img.src = src
  } else if (img === true) {
    // loading
    this.callbacks[src].push(callback)
  } else {
    // release zalgo
    callback && callback(img)
  }
}


function SpecCache() {
  this.specs = {}
  this.callbacks = {}
}

SpecCache.prototype.get = function(id, callback) {
  var spec = this.specs[id]

  if (spec == null) {
    this.specs[id] = true
    this.callbacks[id] = [callback]

    var req = window.XDomainRequest ? new XDomainRequest() : new XMLHttpRequest()
    req.onload = function(ev) {
      var spec = JSON.parse(req.responseText)
      this.specs[id] = spec
      for (var i = 0; i < this.callbacks[id].length; i++) {
        var callback = this.callbacks[id][i]
        callback && callback(spec)
      }
      delete this.callbacks[id]
    }.bind(this)

    req.open("GET", '//c.xkcd.com/turtle/' + id, true)
    req.send()
  } else if (spec === true) {
    // loading
    this.callbacks[id].push(callback)
  } else {
    // release zalgo
    callback && callback(this.specs[id])
  }
}


function getImageData(img, w, h) {
  var canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  var ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, w, h)
}


function scaleImage(img, baseSize, size) {
  var step = 1.5
  var firstStep = Math.pow(step, Math.floor(log(baseSize, step)))
  var idx
  var tileSize
  if (size > firstStep) {
    idx = 0
    tileSize = baseSize
  } else {
    idx = Math.ceil(log(size, step))
    tileSize = Math.pow(step, idx)
    idx = Math.floor(log(baseSize, step)) - idx + 1
  }
  var canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.max(tileSize, size)
  var ctx = canvas.getContext('2d')
  ctx.drawImage(img, baseSize * idx, 0, tileSize, tileSize, 0, 0, size, size)
  return ctx.getImageData(0, 0, size, size)
}


function Turtle(imgCache, specCache, id, w, h, parent) {
  this.imgCache = imgCache
  this.specCache = specCache
  this.id = id
  this.w = w
  this.h = h
  this.parent = parent
  this.data = null

  this._nid = Turtle.nid++
  Turtle.ntov[this._nid] = this

  this._waiting = {}

  this.imgCache.get(this._src(id), function(img) {
    this.img = img
    this._onData()
  }.bind(this))

  this.specCache.get(id, function(spec) {
    this.spec = spec

    // preload imgs
    for (var color in spec) {
      for (var i = 0; i < spec[color].length; i++) {
        this.imgCache.get(this._src(spec[color][i]))
      }
    }

    this._onData()
  }.bind(this))
}

Turtle.nid = 0
Turtle.ntov = {}  // nids to values (src string or Turtle)
Turtle.kton = {}  // string keys to nids

Turtle.prototype.await = function(key, callback) {
  // return true and queue if we need to wait for data.
  if (this.img && this.spec) {
    return false
  } else {
    this._waiting[key] = callback
    return true
  }
}

Turtle.prototype._onData = function() {
  if (this.img && this.spec) {
    for (var key in this._waiting) {
      this._waiting[key]()
    }
    this._waiting = {}
  }
}

Turtle.prototype._gen = function() {
  if (this.data || !this.img || !this.spec) {
    return
  }

  this.data = new NArray(window.Uint16Array || Array, this.w, this.h)
  var imageData = getImageData(this.img, this.w, this.h)

  // imageData is an array of UInt8s in RGBA order
  for (var i = 0; i < imageData.data.length; i += 4) {
    var isBlack = imageData.data[i] < 128
    var id = isBlack ? choice(this.spec.black) : choice(this.spec.white)
    var n = Turtle.kton[id]
    if (n == null) {
      n = Turtle.nid++
      Turtle.kton[id] = n
      Turtle.ntov[n] = id
    }
    this.data.setLinear(i / 4, n)
  }
}

Turtle.prototype._src = function(id) {
  return imgsEndpoint + 'turtledown/' + id + '-tiled.png'
}

Turtle.prototype.src = function() {
  return this._src(this.id)
}

Turtle.prototype.getSrc = function(dims) {
  this._gen()
  if (!this.data) {
    return
  }

  var item = Turtle.ntov[this.data.get(dims)]
  var id = item.id || item
  return this._src(id)
}

Turtle.prototype.get = function(dims) {
  this._gen()
  if (!this.data) {
    return
  }

  var item = Turtle.ntov[this.data.get(dims)]
  if (!item.id) {
    item = new Turtle(this.imgCache, this.specCache, item, this.w, this.h, this)
    this.data.set(dims, item._nid)
  }
  return item
}


function TurtlesDown(el) {
  this.el = el
  this.imgs = new ImgCache()
  this.specs = new SpecCache()
  this.space = null
  this.pos = []
  this.offset = {
    x: 0,
    y: 0,
    scale: 1
  }
  this.frame = 0

  this._animateTimeout = null
  this.slowdownFactor = .8
  this.zoomVelocity = 0
  this.xVelocity = 0
  this.yVelocity = 0
}

TurtlesDown.prototype.start = function() {
  // via http://stackoverflow.com/a/2746983
  var canvasTest = document.createElement('canvas')
  if (!(canvasTest.getContext && canvasTest.getContext('2d'))) {
    return
  }

  var fallbackImg = this.el.getElementsByTagName("img")
  if (fallbackImg.length) {
    this.el.removeChild(fallbackImg[0])
  }

  this.el.style.position = 'relative'
  this.el.style.overflow = 'hidden'
  this.el.style.margin = '0 auto'
  this.el.title = 'It\'s turtles all the way down.'

  this.canvas = document.createElement('canvas')

  this.size = 600
  this.el.style.width = this.el.style.height = this.size + 'px'
  this.canvas.width = this.canvas.height = this.size

  this.el.appendChild(this.canvas)

  var borderEl = document.createElement('div')
  borderEl.className = 'border'
  borderEl.style.position = 'absolute'
  borderEl.style.top = borderEl.style.right = borderEl.style.bottom = borderEl.style.left = '0'
  borderEl.style.border = '3px solid black'
  this.el.appendChild(borderEl)

  this.scrollerEl = document.createElement('div')
  this.scrollerEl.className = 'scroller'
  this.scrollerEl.style.position = 'absolute'
  this.scrollerEl.style.top = '0'
  this.scrollerEl.style.width = (this.size + 50) + 'px'
  this.scrollerEl.style.height = (this.size + 50) + 'px'
  this.scrollerEl.style.overflow = 'scroll'
  var scrollerFill = document.createElement('div')
  this.scrollerEl.appendChild(scrollerFill)
  this.el.appendChild(this.scrollerEl)

  this.scrollerEl.addEventListener('scroll', this._onScroll.bind(this), false)
  scrollerFill.style.width = (this.size + 1000) + 'px'
  scrollerFill.style.height = (this.size + 1000) + 'px'
  scrollerFill.style.background = 'rgba(0, 0, 0, 0)'
  this.scrollerEl.scrollTop = 500

  this._lastClick = 0
  this._mousePos = {x: this.size / 2, y: this.size / 2}
  this.el.addEventListener('mousedown', this._startDrag.bind(this), false)
  this.el.addEventListener('mousemove', this._storeMousePos.bind(this), false)
  this._moveDrag = this._moveDrag.bind(this)
  this._endDrag = this._endDrag.bind(this)
  this._lastPinchDist = null
  this.el.addEventListener('touchstart', this._startTouch.bind(this), false)
  this.el.addEventListener('touchmove', this._moveTouch.bind(this), false)
  this._moveTouch = this._moveTouch.bind(this)
  this._endTouch = this._endTouch.bind(this)

  this.ctx = this.canvas.getContext('2d')
  this.ctx.imageSmoothingEnabled = false
  this.ctx.mozImageSmoothingEnabled = false
  this.ctx.webkitImageSmoothingEnabled = false
  this.ctx.msImageSmoothingEnabled = false
  this.ctx.oImageSmoothingEnabled = false

  this._drawTimes = [0, 0, 0]
  this.pixelThreshold = 5

  this.space = new Turtle(this.imgs, this.specs, 'turtles', this.size, this.size)

  this.render()
}

TurtlesDown.prototype._storeMousePos = function(ev) {
  var offset = this.el.getBoundingClientRect()
  this._mousePos = {x: ev.clientX - offset.left, y: ev.clientY - offset.top}
}

TurtlesDown.prototype._onScroll = function(ev) {
  if (this.scrollerEl.scrollTop == 500) {
    return
  }

  var dir = this.scrollerEl.scrollTop < 500
  this.scrollerEl.scrollTop = 500

  this.zoomVelocity += (dir ? 1 : -1) * .02
  this._startAnimate()
}

TurtlesDown.prototype._zoom = function(frac) {
  var centerOffset = this.size / 2
  var originX = (this._mousePos.x - centerOffset)
  var originY = (this._mousePos.y - centerOffset)

  var oldScale = this.offset.scale
  this.offset.scale *= frac

  // FIXME: these formulae are slighly off, somehow.
  var scaleDeltaX = (originX * this.offset.scale - originX * oldScale) / this.offset.scale
  this.offset.x = ((this.offset.x - centerOffset) * this.offset.scale - scaleDeltaX) / this.offset.scale + centerOffset
  var scaleDeltaY = (originY * this.offset.scale - originY * oldScale) / this.offset.scale
  this.offset.y = ((this.offset.y - centerOffset) * this.offset.scale - scaleDeltaY) / this.offset.scale + centerOffset

  this.render()
}

TurtlesDown.prototype._startDrag = function(ev) {
  if (ev.button != null && ev.button != 0) {
    return
  }

  if (Date.now() - this._lastClick < 250) {
    this.zoomVelocity += .15
    this._animate()
  }
  this._lastClick = Date.now()
  this._lastDrag = null

  this.el.style.cursor = 'move'
  document.addEventListener('mousemove', this._moveDrag, false)
  document.addEventListener('mouseup', this._endDrag, false)
  document.addEventListener('touchmove', this._moveTouch, false)
  document.addEventListener('touchend', this._endTouch, false)
  ev.preventDefault && ev.preventDefault()
}

TurtlesDown.prototype._moveDrag = function(ev) {
  if (this._lastDrag && ev.clientX == this._lastDrag.x) {
    // this happens on touch moves -- due to duplicate mouse events?
    return
  }

  var now = Date.now()
  var last = this._lastDrag || {x: ev.clientX, y: ev.clientY, ts: now}
  this.offset.x += (ev.clientX - last.x) / this.offset.scale
  this.offset.y += (ev.clientY - last.y) / this.offset.scale
  this._lastDrag = {
    x: ev.clientX,
    y: ev.clientY,
    xDelta: ev.clientX - last.x,
    yDelta: ev.clientY - last.y,
    ts: now,
    tDelta: now - last.ts
  }
  this.render()
}

TurtlesDown.prototype._endDrag = function(ev) {
  this.el.style.cursor = 'default'
  if (this._lastDrag && this._lastDrag.tDelta > 0) {
    var now = Date.now()
    this.xVelocity = 10 * this._lastDrag.xDelta / this._lastDrag.tDelta
    this.yVelocity = 10 * this._lastDrag.yDelta / this._lastDrag.tDelta
    this._lastDrag = null
    this._animate()
  }
  document.removeEventListener('mousemove', this._moveDrag, false)
  document.removeEventListener('mouseup', this._endDrag, false)
  document.removeEventListener('touchmove', this._moveTouch, false)
  document.removeEventListener('touchend', this._endTouch, false)
}

TurtlesDown.prototype._startTouch = function(ev) {
  if (ev.touches.length == 1) {
    this._startDrag({clientX: ev.touches[0].clientX, clientY: ev.touches[0].clientY})
  }
  ev.preventDefault()
}

TurtlesDown.prototype._moveTouch = function(ev) {
  if (ev.touches.length == 2) {
    var xDist = ev.touches[1].clientX - ev.touches[0].clientX
    var yDist = ev.touches[1].clientY - ev.touches[0].clientY
    this._mousePos = {
      x: ev.touches[0].clientX + xDist / 2,
      y: ev.touches[0].clientY + yDist / 2
    }
    var pinchDist = Math.sqrt(Math.pow(xDist, 2), Math.pow(yDist, 2))
    if (this._lastPinchDist && pinchDist != this._lastPinchDist) {
      this._zoom(pinchDist / this._lastPinchDist)
    }
    this._lastPinchDist = pinchDist
  } else {
    this._lastPinchDist = null
    this._moveDrag({clientX: ev.touches[0].clientX, clientY: ev.touches[0].clientY})
  }
  ev.preventDefault()
}

TurtlesDown.prototype._endTouch = function(ev) {
  this._lastPinchDist = null
  this._endDrag()
  ev.preventDefault()
}

TurtlesDown.prototype._startAnimate = function() {
  if (!this._animateTimeout) {
    this._animate()
  }
}

TurtlesDown.prototype._animate = function() {
  this.offset.x += this.xVelocity / this.offset.scale
  this.offset.y += this.yVelocity / this.offset.scale
  this._zoom(1 + this.zoomVelocity)
  this.xVelocity *= this.slowdownFactor
  this.yVelocity *= this.slowdownFactor
  this.zoomVelocity *= this.slowdownFactor

  if (Math.abs(this.zoomVelocity) + Math.abs(this.xVelocity) + Math.abs(this.yVelocity) > 0.001) {
    this._animateTimeout = setTimeout(this._animate.bind(this), 1000 / 60)
  } else {
    this._animateTimeout = null
  }
}

TurtlesDown.prototype._draw = function(src, x, y, size, options) {
  var frame = this.frame
  this.imgs.get(src, function(img) {
    if (this.frame != frame) {
      return
    }

    if (options.hasOwnProperty('alpha')) {
      this.ctx.globalAlpha = options.alpha
    } else {
      this.ctx.globalAlpha = 1
    }

    if (options && options.cache) {
      var key = src + ':' + size + 'x' + size
      var imageData = this.scaleCache[key]
      if (!imageData) {
        var imageData = this.scaleCache[key] = scaleImage(img, this.size, size)
      }
      this.ctx.putImageData(imageData, x, y)
    } else {
      this.ctx.drawImage(img, 0, 0, this.size, this.size, x, y, size, size)
    }
  }.bind(this))
}

TurtlesDown.prototype.render = function() {
  // there is no elegance here. only sleep deprivation and regret.

  this.frame++
  this.scaleCache = {}

  var os = this.offset
  var centerOffset = this.size / 2

  // clip starting panel bounds
  if (!this.pos.length) {
    this.offset.scale = Math.max(1, os.scale)
    var maxOffset = -centerOffset / os.scale + centerOffset
    this.offset.x = Math.min(Math.max(-maxOffset, os.x), maxOffset)
    this.offset.y = Math.min(Math.max(-maxOffset, os.y), maxOffset)
  }

  var size = this.size * os.scale
  var x1 = (os.x - centerOffset) * os.scale
  var y1 = (os.y - centerOffset) * os.scale

  this.ctx.clearRect(0, 0, this.size, this.size)

  // traverse to grid-exact position
  var parent = this.space
  for (var i = 0; i < this.pos.length - 1; i++) {
    if (parent.await('render', this.render.bind(this))) {
      return
    }
    parent = parent.get(this.pos[i])
  }

  // scale next level of pixels within viewport
  var pixelCount = Math.ceil(this.size / os.scale) + 1
  var xStart = Math.floor((-x1 - centerOffset) / os.scale)
  var yStart = Math.floor((-y1 - centerOffset) / os.scale)

  var outOfPos = (xStart >= this.size || xStart < 0 || yStart >= this.size || yStart < 0)
  if (this.pos.length && (outOfPos || (os.scale < 1 && this.pos.length))) {
    var pos = this.pos.pop()
    this.offset.x = (this.offset.x - centerOffset) * this.offset.scale
    this.offset.y = (this.offset.y - centerOffset) * this.offset.scale
    this.offset.scale *= this.size
    this.offset.x /= this.offset.scale
    this.offset.x += centerOffset - pos[0]
    this.offset.y /= this.offset.scale
    this.offset.y += centerOffset - pos[1]
    return this.render()
  } else if (os.scale > this.size) {
    this.pos.push([xStart, yStart])
    this.offset.x = x1 + xStart * os.scale
    this.offset.y = y1 + yStart * os.scale
    this.offset.scale /= this.size
    this.offset.x /= this.offset.scale
    this.offset.y /= this.offset.scale
    this.offset.x += centerOffset
    this.offset.y += centerOffset
    return this.render()
  }

  var draw = function(turtle, x1, y1, xStart, yStart) {
    var xStart = Math.floor((-x1 - centerOffset) / os.scale)
    var yStart = Math.floor((-y1 - centerOffset) / os.scale)
    var xEnd = Math.min(this.size, xStart + pixelCount)
    var yEnd = Math.min(this.size, yStart + pixelCount)
    xStart = Math.max(0, xStart)
    yStart = Math.max(0, yStart)

    if (os.scale > this.pixelThreshold && !turtle.await('render', this.render.bind(this))) {
      var startTime = Date.now()

      for (var x = xStart; x < xEnd; x++) {
        for (var y = yStart; y < yEnd; y++) {
          var src = turtle.getSrc([x, y])

          var px1 = x1 + x * os.scale + centerOffset
          var py1 = y1 + y * os.scale + centerOffset
          this._draw(src, Math.round(px1) - 1, Math.round(py1) - 1, Math.round(os.scale) + 2, {cache: true})
        }
      }

      this._drawTimes.shift()
      this._drawTimes.push(Date.now() - startTime)

      var sumDrawTime = 0
      for (var i = 0; i < this._drawTimes.length; i++) {
        sumDrawTime += this._drawTimes[i]
      }

      var avgDrawTime = sumDrawTime / this._drawTimes.length
      if (avgDrawTime > 200 && this.pixelThreshold < 30) {
        this.pixelThreshold *= 1.25
      }
    }

    var alphaFac = os.scale / 1.65
    if (os.scale < this.pixelThreshold + alphaFac) {
      this._draw(turtle.src(), x1 + centerOffset, y1 + centerOffset, size, {alpha: Math.min(1, (this.pixelThreshold + alphaFac - os.scale) / alphaFac)})
    }
  }.bind(this)

  // there may be 4 panels on screen at any given time
  for (var i = 0; i <= 1; i++) {
    for (var j = 0; j <= 1; j++) {
      if (x1 + i * size > centerOffset || y1 + j * size > centerOffset) {
        continue
      }

      // hack hack hack
      // carry over wraparounds in position
      // doing a recursive top-down search should clean this up
      var posIdx = this.pos.length - 1
      var pos = this.pos[posIdx]
      var turtle = parent
      if (pos) {
        var posX = pos[0] + i
        var posY = pos[1] + j
        var carryX = posX > this.size - 1
        var carryY = posY > this.size - 1
        var xCarries = [true]
        var yCarries = [true]
        // carry up
        while (posIdx != 0 && (carryX || carryY)) {
          turtle = turtle.parent
          xCarries.unshift(carryX)
          yCarries.unshift(carryY)
          posIdx--
          pos = this.pos[posIdx]
          var posX = pos[0] + (carryX ? i : 0)
          var posY = pos[1] + (carryY ? j : 0)
          carryX = posX > this.size - 1
          carryY = posY > this.size - 1
        }
        xCarries.shift()
        yCarries.shift()
        // carry down
        while (posIdx < this.pos.length - 1) {
          if (turtle.await('render', this.render.bind(this))) {
            return
          }
          turtle = turtle.get([posX, posY])
          posIdx++
          pos = this.pos[posIdx]
          var posX = (pos[0] + (xCarries.shift() ? i : 0)) % this.size
          var posY = (pos[1] + (yCarries.shift() ? j : 0)) % this.size
        }
        if (turtle.await('render', this.render.bind(this))) {
          return
        }
        turtle = turtle.get([posX, posY])
      }
      draw(turtle, x1 + i * size, y1 + j * size, xStart + i * pixelCount, yStart + j * pixelCount)
    }
  }
}
