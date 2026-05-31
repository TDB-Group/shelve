import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

const currentDir = dirname(fileURLToPath(import.meta.url))
const migrationsDir = process.env.SHELVE_MIGRATIONS_DIR || join(currentDir, '../migrations/postgresql')
const falseValues = new Set(['0', 'false', 'no', 'off'])

const fileBackedEnvVars = [
  'DATABASE_URL',
  'POSTGRES_PASSWORD',
  'NUXT_SESSION_PASSWORD',
  'NUXT_PRIVATE_ENCRYPTION_KEY',
  'NUXT_OAUTH_GITHUB_CLIENT_SECRET',
  'NUXT_OAUTH_GOOGLE_CLIENT_SECRET',
  'NUXT_PRIVATE_GITHUB_PRIVATE_KEY',
  'NUXT_PRIVATE_RESEND_API_KEY',
  'NUXT_PRIVATE_RESEND_WEBHOOK_SECRET',
]

function cleanEnvValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readFileEnv(name) {
  const filePath = cleanEnvValue(process.env[`${name}_FILE`])
  if (!filePath) return

  if (cleanEnvValue(process.env[name])) {
    throw new Error(`Both ${name} and ${name}_FILE are set. Use one source for this secret.`)
  }

  process.env[name] = readFileSync(filePath, 'utf8').trim()
}

function envFlag(name) {
  const value = cleanEnvValue(process.env[name])
  if (!value) return undefined
  return !falseValues.has(value.toLowerCase())
}

function flagEnabled(names, defaultValue) {
  for (const name of names) {
    const value = envFlag(name)
    if (value !== undefined) return value
  }
  return defaultValue
}

function requireEnv(name) {
  const value = cleanEnvValue(process.env[name])
  if (!value) {
    throw new Error(`${name} is required. Set it in Dokploy's Env tab or provide ${name}_FILE.`)
  }
  return value
}

function resolveDatabaseUrl() {
  const existing = cleanEnvValue(process.env.DATABASE_URL)
  if (existing) {
    process.env.DATABASE_URL = existing
    return existing
  }

  const user = cleanEnvValue(process.env.POSTGRES_USER) || 'shelve'
  const password = requireEnv('POSTGRES_PASSWORD')
  const host = cleanEnvValue(process.env.POSTGRES_HOST) || 'postgres'
  const port = cleanEnvValue(process.env.POSTGRES_PORT) || '5432'
  const database = cleanEnvValue(process.env.POSTGRES_DB) || 'shelve'
  const sslmode = cleanEnvValue(process.env.POSTGRES_SSLMODE)
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
  const params = sslmode ? `?sslmode=${encodeURIComponent(sslmode)}` : ''
  const url = `postgresql://${auth}@${host}:${port}/${encodeURIComponent(database)}${params}`

  process.env.DATABASE_URL = url
  return url
}

function validateRuntimeEnv(databaseUrl) {
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a postgres:// or postgresql:// URL.')
  }

  const sessionPassword = requireEnv('NUXT_SESSION_PASSWORD')
  if (sessionPassword.length < 32) {
    throw new Error('NUXT_SESSION_PASSWORD must be at least 32 characters long.')
  }

  const encryptionKey = requireEnv('NUXT_PRIVATE_ENCRYPTION_KEY')
  if (encryptionKey.length < 32) {
    throw new Error('NUXT_PRIVATE_ENCRYPTION_KEY must be at least 32 characters long.')
  }

  const githubId = cleanEnvValue(process.env.NUXT_OAUTH_GITHUB_CLIENT_ID)
  const githubSecret = cleanEnvValue(process.env.NUXT_OAUTH_GITHUB_CLIENT_SECRET)
  const googleId = cleanEnvValue(process.env.NUXT_OAUTH_GOOGLE_CLIENT_ID)
  const googleSecret = cleanEnvValue(process.env.NUXT_OAUTH_GOOGLE_CLIENT_SECRET)
  const resendApiKey = cleanEnvValue(process.env.NUXT_PRIVATE_RESEND_API_KEY)
  const senderEmail = cleanEnvValue(process.env.NUXT_PRIVATE_SENDER_EMAIL)

  if (Boolean(githubId) !== Boolean(githubSecret)) {
    throw new Error('Set both NUXT_OAUTH_GITHUB_CLIENT_ID and NUXT_OAUTH_GITHUB_CLIENT_SECRET, or neither.')
  }

  if (Boolean(googleId) !== Boolean(googleSecret)) {
    throw new Error('Set both NUXT_OAUTH_GOOGLE_CLIENT_ID and NUXT_OAUTH_GOOGLE_CLIENT_SECRET, or neither.')
  }

  if (resendApiKey && !senderEmail) {
    throw new Error('NUXT_PRIVATE_SENDER_EMAIL is required when NUXT_PRIVATE_RESEND_API_KEY is set.')
  }

  if (!resendApiKey && !githubId && !googleId) {
    console.warn('[shelve] No auth provider is configured. Add Resend email auth or an OAuth provider before inviting users.')
  }
}

function createPostgresClient(databaseUrl) {
  return postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
    prepare: false,
  })
}

async function waitForDatabase(databaseUrl) {
  if (!flagEnabled(['SHELVE_DB_WAIT'], true)) return

  const timeoutSeconds = Number.parseInt(cleanEnvValue(process.env.SHELVE_DB_WAIT_TIMEOUT_SECONDS) || '90', 10)
  const deadline = Date.now() + timeoutSeconds * 1000
  let lastError

  while (Date.now() < deadline) {
    const sql = createPostgresClient(databaseUrl)
    try {
      await sql`select 1`
      await sql.end({ timeout: 1 })
      console.log('[shelve] Database is reachable.')
      return
    } catch (error) {
      lastError = error
      await sql.end({ timeout: 1 }).catch(() => {})
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  throw new Error(`Database was not reachable after ${timeoutSeconds}s: ${lastError?.message || 'unknown error'}`)
}

async function runMigrations(databaseUrl) {
  if (!flagEnabled(['SHELVE_AUTO_MIGRATE', 'NUXT_AUTO_MIGRATE'], true)) {
    console.log('[shelve] Automatic migrations are disabled.')
    return
  }

  if (!existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`)
  }

  const sql = createPostgresClient(databaseUrl)
  const db = drizzle(sql)

  await sql`select pg_advisory_lock(738279421)`
  try {
    console.log('[shelve] Applying database migrations.')
    await migrate(db, { migrationsFolder: migrationsDir })
    console.log('[shelve] Database migrations are up to date.')
  } finally {
    await sql`select pg_advisory_unlock(738279421)`.catch(() => {})
    await sql.end({ timeout: 5 })
  }
}

try {
  for (const name of fileBackedEnvVars) {
    readFileEnv(name)
  }

  const databaseUrl = resolveDatabaseUrl()
  validateRuntimeEnv(databaseUrl)
  await waitForDatabase(databaseUrl)
  await runMigrations(databaseUrl)

  await import('../server/index.mjs')
} catch (error) {
  console.error(`[shelve] ${error.message}`)
  if (envFlag('SHELVE_DEBUG')) {
    console.error(error)
  }
  process.exit(1)
}
