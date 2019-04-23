const { workerData, parentPort } = require('worker_threads')
const { shared, wasm, syscalls } = workerData
const imports = {}

const s = new Int32Array(shared, 0, 128)

for (const ns of Object.keys(syscalls)) {
  imports[ns] = {}
  for (const method of syscalls[ns]) {
    imports[ns][method] = function (...args) {
      parentPort.postMessage({
        type: 'syscall',
        ns,
        method,
        args
      })

      let head = 0

      while (true) {
        Atomics.wait(s, head, 0)

        const type = s[head++]

        if (type === 1) return s[head]

        const writing = type === 3 // 2 is reading
        const id = s[head++]
        const ptr = s[head++]
        const len = s[head++]

        shareBuffer(id, writing, ptr, len)
      }
    }
  }
}

let w

try {
  w = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports)
} catch (err) {
  parentPort.postMessage({
    type: 'error',
    error: err.message
  })
}

let mem = w && w.exports.memory && new Uint8Array(w.exports.memory.buffer)

parentPort.on('message', function (message) {
  if (message.type === 'call') {
    const result = w.exports[message.method](...message.args)
    parentPort.postMessage({
      type: 'result',
      id: message.id,
      result
    })
    return
  }

  if (message.type === 'read') {
    shareBuffer(message.id, false, message.pointer, message.length)
    return
  }

  if (message.type === 'write') {
    shareBuffer(message.id, true, message.pointer, message.length)
    return
  }
})

function shareBuffer (id, writing, ptr, len) {
  const buf = new SharedArrayBuffer(len + 4)
  const lck = new Int32Array(buf, 0, 1)
  const b = new Uint8Array(buf, 4, len)

  if (!writing) {
    b.set(mem.subarray(ptr, ptr + len))
  }

  parentPort.postMessage({
    type: 'buffer',
    id,
    buffer: buf
  })

  Atomics.wait(lck, 0, 0)

  if (writing) {
    mem.set(b, ptr)
  }
}
