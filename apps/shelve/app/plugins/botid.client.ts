import { initBotId } from 'botid/client/core'

export default defineNuxtPlugin({
  enforce: 'pre',
  setup() {
    const config = useRuntimeConfig()

    if (config.public.botidEnabled !== true && config.public.botidEnabled !== 'true') {
      return
    }

    initBotId({
      protect: [
        { path: '/api/auth/otp/send', method: 'POST' },
        { path: '/api/auth/otp/verify', method: 'POST' },
      ],
    })
  },
})
