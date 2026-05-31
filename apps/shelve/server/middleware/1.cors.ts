import type { H3Event } from 'h3'

function firstHeaderValue(value: string | undefined) {
  return value?.split(',')[0]?.trim() || ''
}

function getRequestOrigins(event: H3Event) {
  const requestUrl = getRequestURL(event)
  const host = firstHeaderValue(getRequestHeader(event, 'x-forwarded-host')) ||
    firstHeaderValue(getRequestHeader(event, 'host'))
  const proto = firstHeaderValue(getRequestHeader(event, 'x-forwarded-proto')) ||
    requestUrl.protocol.replace(':', '')

  return new Set([
    requestUrl.origin,
    host ? `${proto}://${host}` : '',
  ].filter(Boolean))
}

export default defineEventHandler((event) => {
  const origin = getRequestHeader(event, 'origin')
  const runtimeConfig = useRuntimeConfig(event)

  if (origin) {
    const requestOrigins = getRequestOrigins(event)
    const prodDomainPattern = /^https:\/\/(docs\.|www\.|app\.)?shelve\.cloud$/

    const devDomainPattern = /^http:\/\/((shelve\.)?localhost|127\.0\.0\.1):\d+$/

    const customAllowedDomains = runtimeConfig.private.allowedOrigins
      ? runtimeConfig.private.allowedOrigins.split(',').map((d: string) => d.trim())
      : []

    // Vercel preview deployments (accepts any *.vercel.app domain)
    const vercelEnv = process.env.VERCEL_ENV
    const isVercelEnvironment = vercelEnv && ['preview', 'production'].includes(vercelEnv)
    const vercelPreviewPattern = /^https:\/\/.*\.vercel\.app$/

    const isAllowedOrigin =
      requestOrigins.has(origin) ||
      prodDomainPattern.test(origin) ||
      (process.env.NODE_ENV === 'development' && devDomainPattern.test(origin)) ||
      (isVercelEnvironment && vercelPreviewPattern.test(origin)) ||
      customAllowedDomains.includes(origin)

    if (!isAllowedOrigin) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Origin not allowed'
      })
    }

    setResponseHeaders(event, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      'Vary': 'Origin'
    })

    if (event.method === 'OPTIONS') {
      return null
    }
  }
})
