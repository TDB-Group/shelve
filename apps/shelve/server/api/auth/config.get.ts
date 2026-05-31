export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)

  return {
    isGithubEnabled: Boolean(config.oauth.github.clientId && config.oauth.github.clientSecret),
    isGoogleEnabled: Boolean(config.oauth.google.clientId && config.oauth.google.clientSecret),
    isEmailEnabled: Boolean(config.private.resendApiKey),
  }
})
