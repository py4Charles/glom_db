import { createApp } from './app.js'
import { config } from './config.js'
import { pool } from './db.js'

const server = createApp().listen(config.port, () => {
  console.log(`Members API listening on http://localhost:${config.port}`)
  if (config.authMode === 'dev') {
    console.warn(
      '\n  WARNING: AUTH_MODE=dev -- authentication is DISABLED.\n' +
        '  Every request is treated as an authenticated user. Never run this\n' +
        '  against a database that holds real member data.\n',
    )
  }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      pool.end().then(() => process.exit(0))
    })
  })
}
