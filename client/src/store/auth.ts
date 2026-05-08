import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../lib/api'

interface User {
  id: string
  email: string
  name: string
  plan: string
}

interface Credits {
  balance: number
  used: number
  limit: number | null
}

interface LoginResult {
  user: User
  credits: Credits
  lowCredits?: boolean
  balanceInDollars?: number
}

interface AuthState {
  apiKey: string | null
  user: User | null
  credits: Credits | null
  loading: boolean
  error: string | null
  login: (key: string) => Promise<LoginResult>
  logout: () => void
  refreshCredits: () => Promise<void>
  setCredits: (credits: Credits) => void
  initFromServer: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      apiKey: null,
      user: null,
      credits: null,
      loading: false,
      error: null,

      login: async (key) => {
        set({ loading: true, error: null })
        try {
          const result = await api.login(key)
          set({
            apiKey: key,
            user: result.user,
            credits: result.credits,
            loading: false,
            error: null,
          })
          return result
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          set({ loading: false, error: message })
          throw err
        }
      },

      logout: () => {
        void api.logout().catch(() => {})
        set({ apiKey: null, user: null, credits: null, error: null })
      },

      refreshCredits: async () => {
        try {
          const data = await api.me()
          if (data.authenticated) {
            set({
              user: data.user ?? get().user,
              credits: data.credits ?? get().credits,
            })
            return
          }

          set({ apiKey: null, user: null, credits: null })
        } catch {
          // keep existing state on transient failures
        }
      },

      setCredits: (credits) => set({ credits }),

      initFromServer: async () => {
        const { apiKey } = get()
        if (!apiKey) return

        try {
          const data = await api.me()
          if (!data.authenticated) {
            set({ apiKey: null, user: null, credits: null })
            return
          }

          set({
            user: data.user,
            credits: data.credits,
            error: null,
          })
        } catch {
          // keep local state; a network error should not force logout
        }
      },
    }),
    {
      name: 'vs-auth',
      partialize: (state) => ({ apiKey: state.apiKey, user: state.user }),
    },
  ),
)
