import { Terminal, Download, ArrowRight } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useNavigate } from 'react-router-dom'

export function SetupPage() {
  const navigate = useNavigate()
  return (
    <div className="h-dvh flex items-center justify-center bg-black">
      <div className="max-w-[420px] w-full px-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center mx-auto mb-6">
          <Terminal size={26} className="text-[rgba(235,235,245,0.6)]" />
        </div>
        <h2 className="text-[20px] font-semibold mb-2">Install vibecode-cli</h2>
        <p className="text-[13px] text-[rgba(235,235,245,0.5)] mb-6">
          Vibecode Studio requires the vibecode CLI to be installed on your machine.
        </p>

        <div className="bg-[#1c1c1e] rounded-[10px] border border-[rgba(255,255,255,0.08)] p-4 text-left mb-6">
          <p className="text-[11px] text-[rgba(235,235,245,0.4)] mb-2 font-medium uppercase tracking-wide">Install command</p>
          <code className="text-[13px] text-[#30d158] font-mono">npm install -g vibecode-cli</code>
        </div>

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => navigate('/login')}>Back to Login</Button>
          <Button variant="primary" onClick={() => navigate('/')}>
            I've installed it <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  )
}
