import vue from '@vitejs/plugin-vue'

const botIdEnabled = process.env.NUXT_PUBLIC_BOTID_ENABLED === 'true' ||
  (process.env.VERCEL === '1' && process.env.NUXT_PUBLIC_BOTID_ENABLED !== 'false')

export default defineNuxtConfig({
  extends: '../base',

  compatibilityDate: '2025-01-24',

  hub: {
    db: {
      dialect: 'postgresql',
      driver: 'postgres-js',
      applyMigrationsDuringBuild: false,
    },
  },

  ssr: false,

  nitro: {
    experimental: {
      openAPI: true
    },
    rollupConfig: {
      // @ts-expect-error - this is not typed
      plugins: [vue()]
    },
    imports: {
      dirs: ['./server/services']
    }
  },

  css: ['~/assets/css/index.css'],

  runtimeConfig: {
    private: {
      resendApiKey: '',
      resendWebhookSecret: '',
      encryptionKey: '',
      adminEmails: '',
      senderEmail: '',
      allowedOrigins: '',
      github: {
        privateKey: '',
      }
    },
    oauth: {
      google: {
        clientId: '',
        clientSecret: '',
      },
      github: {
        clientId: '',
        clientSecret: '',
      },
    },
    public: {
      botidEnabled: botIdEnabled,
    },
  },

  $development: {
    runtimeConfig: {
      public: {
        github: {
          appName: 'shelve-local',
        },
      },
    },
  },

  $production: {
    runtimeConfig: {
      public: {
        apiUrl: '',
        github: {
          appName: 'shelve-cloud',
        },
      },
    },
  },

  image: {
    format: ['webp', 'jpeg', 'jpg', 'png', 'svg']
  },

  modules: [
    '@nuxt/ui',
    'nuxt-auth-utils',
    '@nuxthub/core',
    ...(botIdEnabled ? ['botid/nuxt'] : []),
  ],

  $test: {
    modules: ['nuxt-auth-utils', '@nuxthub/core'],
    hub: {
      db: {
        dialect: 'postgresql',
        driver: 'pglite',
      },
    },
  },
})
