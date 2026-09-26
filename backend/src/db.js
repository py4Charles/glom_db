import pg from 'pg'
import { config } from './config.js'

// node-postgres parses DATE (oid 1082) into a JS Date in the server's local
// timezone, which silently shifts the calendar day for anyone west of UTC. The
// frontend formats dates as plain 'YYYY-MM-DD' strings, so keep it a string.
pg.types.setTypeParser(1082, (value) => value)

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
})

pool.on('error', (error) => {
  console.error('Unexpected error on an idle Postgres client', error)
})

export function query(text, values) {
  return pool.query(text, values)
}
