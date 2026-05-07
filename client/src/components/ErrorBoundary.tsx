import { Component, ReactNode } from 'react'
import { addClientLog } from '../lib/serverLogs'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    addClientLog('ErrorBoundary', 'React error caught', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    })
    console.error('React error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
          <div className="text-center max-w-md p-8">
            <div className="w-16 h-16 rounded-2xl bg-[#ff453a]/10 border border-[#ff453a]/20 flex items-center justify-center mx-auto mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[#ff453a]" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <h2 className="text-[18px] font-semibold text-white mb-2">Something went wrong</h2>
            <p className="text-[14px] text-white/50 mb-6">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-xl bg-[#0a84ff] hover:bg-[#0a84ff]/90 text-white font-medium transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
