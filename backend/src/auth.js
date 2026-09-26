import { createClient } from '@supabase/supabase-js'
import { config } from './config.js'

// Built only in supabase mode. Uses the anon key, never the service role key:
// this client exists solely to verify tokens.
let supabase = null

if (config.authMode === 'supabase') {
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function verifySupabaseSession(req, res, next) {
  const header = req.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : null

  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' })
  }

  // getUser() asks the auth server to verify the token. getSession() would only
  // decode the JWT locally and trust its claims, which is not authentication.
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data?.user) {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }

  // Because Row Level Security is enabled with no policies, this server holds
  // the only key that can read members. Every route past this middleware is
  // reachable by any signed-in user, so authorization checks belong here and in
  // the handlers -- not in the database.
  req.user = data.user
  next()
}

export function requireSession(req, res, next) {
  if (config.authMode === 'dev') {
    req.user = { id: 'dev', email: 'dev@localhost' }
    return next()
  }
  return verifySupabaseSession(req, res, next)
}
