import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Zap } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { LowCreditsDialog } from '../components/dialogs/LowCreditsDialog'

export function LoginPage() {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [showLowCredits, setShowLowCredits] = useState(false)
  const [pendingBalance, setPendingBalance] = useState(0)
  const { login, loading, error, apiKey } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => { if (apiKey) navigate('/', { replace: true }) }, [apiKey])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) return
    try {
      const result = await login(key.trim())
      
      // Check for low credits warning
      if (result?.lowCredits) {
        setPendingBalance(result.balanceInDollars || 0)
        setShowLowCredits(true)
        return
      }
      
      navigate('/', { replace: true })
    } catch {}
  }

  const handleLowCreditsConfirm = () => {
    setShowLowCredits(false)
    navigate('/', { replace: true })
  }

  const handleLowCreditsCancel = () => {
    setShowLowCredits(false)
    setKey('')
  }

  return (
    <div className="h-dvh flex items-center justify-center bg-black">
      <div className="w-full max-w-[360px] px-4">
        {/* Logo mark */}
        <div className="flex justify-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#0a84ff] flex items-center justify-center shadow-lg shadow-[rgba(10,132,255,0.35)]">
            <Zap size={28} strokeWidth={2.5} className="text-white" />
          </div>
        </div>

        <h1 className="text-[22px] font-semibold text-white text-center mb-1">Vibecode Studio</h1>
        <p className="text-[13px] text-[rgba(235,235,245,0.5)] text-center mb-8">
          Enter your Vibecode API key to continue
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="vbc_••••••••••••••••••••••"
              spellCheck={false}
              autoComplete="off"
              className="w-full h-11 rounded-[10px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)]
                         text-[14px] text-white placeholder:text-[rgba(235,235,245,0.25)]
                         px-4 pr-11 focus:outline-none focus:border-[#0a84ff] transition-colors font-mono"
            />
            <button
              type="button"
              onClick={() => setShow(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[rgba(235,235,245,0.35)] hover:text-white transition-colors"
            >
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div className="text-[12px] text-[#ff453a] bg-[rgba(255,69,58,0.1)] border border-[rgba(255,69,58,0.2)] rounded-[8px] px-3 py-2">
              {error}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!key.trim()}
            className="w-full h-11 text-[14px] font-semibold"
          >
            Continue
          </Button>
        </form>

        <p className="text-[11px] text-[rgba(235,235,245,0.3)] text-center mt-6">
          Find your API key at{' '}
          <a href="https://vibecode.com/settings" target="_blank" rel="noreferrer"
             className="text-[#0a84ff] hover:underline">
            vibecode.com/settings
          </a>
        </p>
      </div>
      
      <LowCreditsDialog
        open={showLowCredits}
        balance={pendingBalance}
        onConfirm={handleLowCreditsConfirm}
        onCancel={handleLowCreditsCancel}
      />
    </div>
  )
}
