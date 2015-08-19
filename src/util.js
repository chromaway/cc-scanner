export function promisify (fn) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      args.push((err, ...result) => {
        if (err) {
          return reject(err)
        }

        resolve(...result)
      })

      fn.apply(this, args)
    })
  }
}

export function sleep (timeout) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeout)
  })
}
