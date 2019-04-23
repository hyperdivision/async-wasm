const fs = require('fs')
const AsyncWasm = require('../')

const aw = new AsyncWasm(fs.readFileSync('hello.wasm'), {
  hypermachine: {
    fetch (ptr, cb) {
      console.log('fetch is called', ptr)

      aw.read(ptr, 10, function (_, buf) {
        console.log('read', buf)
        aw.write(ptr, Buffer.from('lolol'), function () {
          console.log('wrote data')
          aw.read(ptr, 10, function (_, buf) {
            console.log('read now', buf)
            cb(null, 10)
          })
        })
      })
    }
  }
})

aw.call('hello_world', function (err, val) {
  console.log('done', err, val)
  aw.destroy()
})
