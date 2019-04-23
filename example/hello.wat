(module
  (func $fetch (import "hypermachine" "fetch") (param i32) (result i32))
  (memory (export "memory") 10 10000)

  (func $hello.world (export "hello_world")
    (result i32)

    (i32.add (call $fetch (i32.const 1)) (i32.const 10))
  )
)
