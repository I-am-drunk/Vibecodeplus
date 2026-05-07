import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../lib/api'

interface User { id: string; email: string; name: string; plan: string }
interface Credits { balance: number; used: number; limit: number | null }

interface AuthState {
  apiKey: string | null
  user: User | null
  credits: Credits | null
  loading: boolean
  error: string | null
  login: (key: string) => Promise<void>
  logout: () => void
  refreshCredits: () => Promise<void>
  setCredits: (c: Credits) => void
  initFromServer: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      apiKey: null, user: null, credits: null, loading: false, error: null,

      login: async (key) => {
        set({ loading: true, error: null })
        try {
          const result = await api.login(key)
          console.log('[auth] logged in as', result.user?.email)
          set({ apiKey: key, user: result.user, credits: result.credits, loading: false })
          return result
        } catch (err) {
          set({ loading: false, error: err instanceof Error ? err.message : String(err) })
          throw err
        }
      },

      logout: () => {
        console.log('[auth] logging out')
        api.logout().catch(() => {})
        set({ apiKey: null, user: null, credits: null })
      },

      refreshCredits: async () => {
        try {
          const data = await api.me()
          if (data.credits) {
            set({ credits: data.credits })
            console.log('[auth] credits:', data.credits.balance)
          }
          if (data.user && !get().user) set({ user: data.user })
        } catch (e) { console.warn('[auth] refresh failed', e) }
      },

      setCredits: (credits) => set({ credits }),

      initFromServer: async () => {
        // Sync stored API key with server state
        const { apiKey } = get()
        if (!apiKey) return
        try {
          const data = await api.me()
          if (data.authenticated) {
            set({ user: data.user, credits: data.credits })
            console.log('[auth] server confirms key valid for', data.user?.email)
          } else {
            console.warn('[auth] stored key not valid on server')
          }
        } catch (e) { console.warn('[auth] initFromServer failed', e) }
      },
    }),
    { name: 'vs-auth', partialize: (s) => ({ apiKey: s.apiKey, user: s.user }) }
  )
)
