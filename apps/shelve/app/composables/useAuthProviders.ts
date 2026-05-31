type AuthProviderConfig = {
  isGithubEnabled: boolean
  isGoogleEnabled: boolean
  isEmailEnabled: boolean
}

const defaultAuthProviderConfig: AuthProviderConfig = {
  isGithubEnabled: false,
  isGoogleEnabled: false,
  isEmailEnabled: false,
}

export function useAuthProviders() {
  const appConfig = useAppConfig()
  const fallback = {
    ...defaultAuthProviderConfig,
    ...appConfig.auth,
  }

  const { data, status } = useFetch<AuthProviderConfig>('/api/auth/config', {
    key: 'auth-provider-config',
    default: () => fallback,
  })

  return {
    isGithubEnabled: computed(() => data.value?.isGithubEnabled ?? false),
    isGoogleEnabled: computed(() => data.value?.isGoogleEnabled ?? false),
    isEmailEnabled: computed(() => data.value?.isEmailEnabled ?? false),
    authProvidersStatus: status,
  }
}
