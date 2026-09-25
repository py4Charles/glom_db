import 'dotenv/config'

function required(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// The service role key bypasses RLS and can read and write every member record.
// Vite exposes any variable prefixed VITE_ to the browser bundle, so a single
// misnamed variable would publish this key to every visitor. Fail loudly rather
// than starting a server that has already leaked it.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (serviceKey) {
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith('VITE_') && value === serviceKey) {
      throw new Error(
        `Refusing to start: ${name} contains the Supabase service role key. ` +
          'Rename it and never prefix a secret with VITE_.',
      )
    }
  }
}

// 'dev' skips authentication entirely, which is only ever acceptable on a
// developer machine with no real member data in it. The hard refusal below is
// the only thing stopping that from becoming a production incident.
const authMode = process.env.AUTH_MODE === 'supabase' ? 'supabase' : 'dev'

if (authMode === 'dev' && process.env.NODE_ENV === 'production') {
  throw new Error(
    'Refusing to start: AUTH_MODE is "dev", which disables authentication. ' +
      'Set AUTH_MODE=supabase before deploying.',
  )
}

const supabaseKeysProvided = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
if (authMode === 'supabase' && !supabaseKeysProvided) {
  throw new Error('AUTH_MODE=supabase requires SUPABASE_URL and SUPABASE_ANON_KEY')
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  authMode,
  databaseUrl: required('DATABASE_URL'),
  supabaseUrl: supabaseKeysProvided ? process.env.SUPABASE_URL : null,
  supabaseAnonKey: supabaseKeysProvided ? process.env.SUPABASE_ANON_KEY : null,
}
