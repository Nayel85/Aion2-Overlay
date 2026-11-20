// Vite 7 calls crypto.hash(), which Node added in 20.12: a few lines stand in for it on older Nodes
// (the playground only; the app's own build runs through electron-vite as before).
const crypto = require('node:crypto')
if (typeof crypto.hash !== 'function') {
  crypto.hash = (algorithm, data, outputEncoding = 'hex') => crypto.createHash(algorithm).update(data).digest(outputEncoding)
}
