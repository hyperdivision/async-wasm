# async-wasm

Add asynchronous external JS calls to your WASM that behave as sync WASM functions

```
npm install async-wasm
```

Currently there is no way to do async calls from wasm (all external calls are sync).
This means it's tricky to call out from WASM to do I/O in Javascript.

This module makes was support that, by using a Worker thread from Node.js to run the WASM
and resolve the async calls in the main worker, while the thread is blocking.

NOTE: You might have to run your program with `node --experimental-worker app.js` since
this is using the `worker_threads` core module.

## Usage

``` js
const AsyncWasm = require('async-wasm')

const fs = require('fs')

// Create a new async WASM worker based on a WASM buffer.
// In this example, hello.wasm has one external function hello_world,
// that calls out to a function called fetch in the hypermachine namespace.

const aw = new AsyncWasm(fs.readFileSync('hello.wasm'), {
  hypermachine: {
    fetch (ptr, cb) {
      console.log('fetch is called with argument:', ptr)

      // read(ptr, len, cb) reads from the wasm memory
      aw.read(ptr, 10, function (_, buf) {
        console.log('read', buf)

        // write(ptr, buf, cb) writes to the wasm memory
        aw.write(ptr, Buffer.from('lolol'), function () {
          console.log('wrote data')

          aw.read(ptr, 10, function (_, buf) {
            console.log('read now', buf)

            // Call the callback with a numeric return value when done
            // If you call it with an error, -1 is returned in wasm.
            cb(null, 10)
          })
        })
      })
    }
  }
})

// Invoke external methods on the WASM using the `.call(name, ...args, cb)` method.
aw.call('hello_world', function (err, val) {
  console.log('done', err, val)
  aw.destroy()
})
```

See the example folder for a full example that contains the WAT/WASM code as well.

## License

MIT
