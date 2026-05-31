import type { H3Event } from 'h3'

export async function assertHumanRequest(event: H3Event) {
  const config = useRuntimeConfig(event)

  if (config.public.botidEnabled !== true && config.public.botidEnabled !== 'true') {
    return
  }

  const { checkBotId } = await import('botid/server')
  const verification = await checkBotId()

  if (verification.isBot) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Access denied',
    })
  }
}
