import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey = (
  import.meta.env.VITE_SUPABASE_ANON_KEY
  ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

// Circuit breaker: if the backend is unreachable (bad URL, DNS failure, offline),
// stop hitting the network for a while so every page falls back to local data
// instantly instead of each request waiting for its own timeout.
const OFFLINE_COOLDOWN_MS = 60_000
const REQUEST_TIMEOUT_MS = 4_000
let offlineUntil = 0

export function isBackendOffline() {
  return Date.now() < offlineUntil
}

const resilientFetch: typeof fetch = async (input, init = {}) => {
  if (isBackendOffline()) {
    throw new TypeError('Backend unreachable (circuit open)')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal })
  } catch (err) {
    offlineUntil = Date.now() + OFFLINE_COOLDOWN_MS
    console.warn(`[supabase] Backend unreachable; using local data for ${OFFLINE_COOLDOWN_MS / 1000}s.`, err)
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export const supabase = supabaseUrl && supabasePublishableKey
  ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: { fetch: resilientFetch },
  })
  : null