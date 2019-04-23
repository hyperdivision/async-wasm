const { Worker } = require('worker_threads')
const { EventEmitter } = require('events')
const path = require('path')

module.exports = class AsyncWasm extends EventEmitter {
  constructor (wasm, syscalls) {
    super()

    const shared = new SharedArrayBuffer(4 * 128)
    const imports = {}

    Object.keys(syscalls).forEach(function (ns) {
      imports[ns] = Object.keys(syscalls[ns])
    })

    const w = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: {
        shared,
        wasm,
        syscalls: imports
      }
    })

    this.destroyed = false

    this._worker = w
    this._shared = new Int32Array(shared, 0, 128)
    this._calling = false
    this._head = 0
    this._callbacks = []

    w.on('message', (m) => {
      if (m.type === 'buffer') {
        const cb = this._pull(m.id)
        const lck = new Int32Array(m.buffer, 0, 1)
        const buf = Buffer.from(m.buffer).slice(4)

        if (cb.buffer) { // is writing
          cb.buffer.copy(buf)
          cb.callback(null, cb.buffer)
        } else { // is reading
          cb.callback(null, buf)
        }

        lck[0] = 1
        Atomics.notify(lck, 0)
        return
      }

      if (m.type === 'result') {
        const cb = this._pull(m.id)
        cb.callback(null, m.result)
        return
      }

      if (m.type === 'syscall') {
        const fn = syscalls[m.ns][m.method]

        m.args.push((err, res) => {
          const head = this._head
          this._shared[this._head++] = 1
          this._shared[this._head++] = err ? -1 : res

          this._calling = false
          Atomics.notify(this._shared, head)
        })

        this._head = 0
        this._calling = true
        fn(...m.args)
        return
      }

      if (m.type === 'error') {
        const err = new Error(m.error)
        this.emit('error', err)
        return
      }
    })
  }

  _pull (id) {
    const cb = this._callbacks[id]
    this._callbacks[id] = null
    while (this._callbacks.length && this._callbacks[this._callbacks.length - 1] === null) this._callbacks.pop()
    return cb
  }

  destroy () {
    this.destroyed = true
    this._worker.terminate()

    while (this._callbacks.length) {
      const cb = this._pull(this._callbacks.length - 1)
      cb.callback(new Error('Worker destroyed'))
    }
  }

  write (pointer, buffer, cb) {
    if (!cb) cb = noop
    if (this.destroyed) return process.nextTick(cb, new Error('Worker destroyed'))

    const id = this._callbacks.length

    this._callbacks.push({
      buffer,
      callback: cb
    })

    if (this._calling) {
      const head = this._head
      this._shared[this._head++] = 3
      this._shared[this._head++] = id
      this._shared[this._head++] = pointer
      this._shared[this._head++] = buffer.length
      Atomics.notify(this._shared, head)
    } else {
      this._worker.postMessage({
        type: 'write',
        id,
        pointer,
        length: buffer.length
      })
    }
  }

  read (pointer, length, cb) {
    if (this.destroyed) return process.nextTick(cb, new Error('Worker destroyed'))

    const id = this._callbacks.length

    this._callbacks.push({
      buffer: null,
      callback: cb
    })

    if (this._calling) {
      const head = this._head
      this._shared[this._head++] = 2
      this._shared[this._head++] = id
      this._shared[this._head++] = pointer
      this._shared[this._head++] = length
      Atomics.notify(this._shared, head)
    } else {
      this._worker.postMessage({
        type: 'read',
        id,
        pointer,
        length
      })
    }
  }

  call (method, ...args) {
    const cb = (args.length && typeof args[args.length - 1] === 'function') ? args.pop() : noop

    if (this.destroyed) return process.nextTick(cb, new Error('Worker destroyed'))

    const id = this._callbacks.length

    this._callbacks.push({
      buffer: null,
      callback: cb
    })

    this._worker.postMessage({
      type: 'call',
      id,
      method,
      args
    })
  }
}

function noop () {}
