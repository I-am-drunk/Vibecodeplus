import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Eye, EyeOff, Check, AlertTriangle, Loader2, ExternalLink, KeyRound, CreditCard, Sliders, Info, Zap, User } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { api } from '../lib/api'
import { MODELS, cn } from '../lib/utils'
import { addClientLog } from '../lib/serverLogs'

type Tab = 'account' | 'preferences' | 'about'

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn('relative w-11 h-6 rounded-full transition-colors duration-150 flex-shrink-0', value ? 'bg-[#0a84ff]' : 'bg-white/[0.15]')}
    >
      <span className={cn('absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-150', value ? 'translate-x-[23px]' : 'translate-x-[3px]')} />
    </button>
  )
}

function PrefRow({ label, hint, first, children }: { label: string; hint?: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between gap-4 px-6 py-4', !first && 'border-t border-white/[0.05]')}>
      <div>
        <p className="text-[15px] text-white/80">{label}</p>
        {hint && <p className="text-[13px] text-white/35 mt-1">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111113] overflow-hidden">
      {children}
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { apiKey, user, credits, login, refreshCredits } = useAuthStore()

  const [tab, setTab] = useState<Tab>('account')
  const [key, setKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [keySaved, setKeySaved] = useState(false)
  const [keyError, setKeyError] = useState('')
  const [settings, setSettings] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  addClientLog('Settings', 'page rendered', { tab, hasApiKey: !!apiKey, hasUser: !!user, hasSettings: !!settings })

  useEffect(() => {
    addClientLog('Settings', 'mount effect - fetching settings and credits')
    refreshCredits()
      .then(() => addClientLog('Settings', 'credits refreshed'))
      .catch(err => addClientLog('Settings', 'credits refresh failed', { error: String(err) }))
    api.getSettings()
      .then(s => {
        setSettings(s)
        addClientLog('Settings', 'settings loaded', s)
      })
      .catch(err => addClientLog('Settings', 'settings load failed', { error: String(err) }))
  }, [])

  const saveKey = async () => {
    addClientLog('Settings', 'saveKey called', { keyLength: key.length, keyTrimmed: !!key.trim() })
    if (!key.trim()) {
      addClientLog('Settings', 'saveKey aborted - empty key')
      return
    }
    setSavingKey(true); setKeyError('')
    addClientLog('Settings', 'saveKey attempting login', { keyPrefix: key.trim().slice(0, 15) })
    try {
      await login(key.trim())
      addClientLog('Settings', 'saveKey login successful')
      setKey(''); setKeySaved(true)
      setTimeout(() => {
        setKeySaved(false)
        addClientLog('Settings', 'keySaved state cleared')
      }, 2500)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addClientLog('Settings', 'saveKey login failed', { error: msg })
      setKeyError(msg)
    } finally {
      setSavingKey(false)
      addClientLog('Settings', 'saveKey savingKey cleared')
    }
  }

  const saveSettings = async () => {
    addClientLog('Settings', 'saveSettings called', { hasSettings: !!settings })
    if (!settings) {
      addClientLog('Settings', 'saveSettings aborted - no settings')
      return
    }
    setSaving(true)
    addClientLog('Settings', 'saveSettings calling api.patchSettings', settings)
    try {
      await api.patchSettings(settings)
      addClientLog('Settings', 'saveSettings api call successful')
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        addClientLog('Settings', 'saved state cleared')
      }, 2000)
    } catch (err) {
      addClientLog('Settings', 'saveSettings api call failed', { error: String(err) })
    } finally {
      setSaving(false)
      addClientLog('Settings', 'saveSettings saving cleared')
    }
  }

  const patch = (section: string, v: any) => {
    addClientLog('Settings', 'patch settings', { section, value: v })
    setSettings((s: any) => {
      if (!s) return s
      return { ...s, [section]: { ...s[section], ...v } }
    })
  }

  const creditsPct = credits?.limit ? Math.min((credits.balance / credits.limit) * 100, 100) : null
  const creditsLow = credits && credits.balance < 5

  addClientLog('Settings', 'render credits state', { creditsPct, creditsLow, balance: credits?.balance, limit: credits?.limit })

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'account',     label: 'Account',     icon: User },
    { id: 'preferences', label: 'Preferences', icon: Sliders },
    { id: 'about',       label: 'About',       icon: Info },
  ]

  return (
    <div className="h-dvh flex flex-col bg-[#0a0a0a]">
      <nav className="flex-shrink-0 flex items-center gap-3 px-8 h-16 border-b border-white/[0.06] bg-[#0d0d0d]">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 h-8 px-2.5 rounded-lg hover:bg-white/[0.06] text-white/40 hover:text-white/80 transition-colors -ml-1"
        >
          <ChevronLeft size={16} />
          <span className="text-[14px] font-medium">Back</span>
        </button>
        <div className="w-px h-5 bg-white/[0.07]" />
        <span className="text-[16px] font-bold text-white">Settings</span>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">

          {/* Tab bar */}
          <div className="flex items-center gap-1.5 p-1.5 bg-[#111113] border border-white/[0.07] rounded-2xl mb-8">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'flex items-center gap-2.5 flex-1 justify-center h-10 rounded-xl text-[14px] font-medium transition-colors',
                  tab === t.id ? 'bg-[#1e1e21] text-white border border-white/[0.08]' : 'text-white/40 hover:text-white/70'
                )}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>

          {/* ── ACCOUNT ── */}
          {tab === 'account' && (
            <div className="space-y-5">
              {user && (
                <Card>
                  <div className="p-6">
                    <div className="flex items-center gap-4 mb-5">
                      <div className="w-12 h-12 rounded-xl bg-[#0a84ff] flex items-center justify-center text-[16px] font-bold text-white flex-shrink-0">
                        {user.email?.[0]?.toUpperCase() ?? 'V'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold text-white truncate">{user.name || user.email}</p>
                        <p className="text-[14px] text-white/40 truncate">{user.email}</p>
                      </div>
                      {credits && (
                        <div className="text-right flex-shrink-0">
                          <p className={cn('text-[18px] font-bold tabular-nums', creditsLow ? 'text-[#ff9f0a]' : 'text-white')}>
                            ${credits.balance.toFixed(2)}
                          </p>
                          <p className="text-[12px] text-white/30">credits</p>
                        </div>
                      )}
                    </div>
                    {creditsPct !== null && (
                      <>
                        <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden mb-3">
                          <div
                            className={cn('h-full rounded-full transition-all', creditsLow ? 'bg-[#ff9f0a]' : 'bg-[#0a84ff]')}
                            style={{ width: `${creditsPct}%` }}
                          />
                        </div>
                        <a href="https://vibecode.dev/payments" target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-[13px] text-[#0a84ff] hover:text-[#409cff] transition-colors">
                          Add credits <ExternalLink size={12} />
                        </a>
                      </>
                    )}
                  </div>
                </Card>
              )}

              <Card>
                <div className="p-6">
                  <p className="text-[12px] font-semibold text-white/30 uppercase tracking-widest mb-5">API Key</p>
                  {apiKey ? (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-[#30d158]/[0.07] border border-[#30d158]/20 mb-5">
                      <Check size={15} className="text-[#30d158]" />
                      <span className="text-[14px] text-[#30d158] font-medium">Configured</span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 px-4 py-3 rounded-lg bg-[#ff9f0a]/[0.07] border border-[#ff9f0a]/20 mb-5">
                      <AlertTriangle size={15} className="text-[#ff9f0a] mt-px flex-shrink-0" />
                      <p className="text-[14px] text-[#ff9f0a]">No API key configured.</p>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <KeyRound size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 pointer-events-none" />
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={key}
                        onChange={e => setKey(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveKey()}
                        placeholder={apiKey ? 'Replace current key…' : 'vibecode_sk_…'}
                        className="w-full h-11 bg-[#0d0d0d] border border-white/[0.08] rounded-xl text-[14px] text-white placeholder:text-white/20 pl-10 pr-11 font-mono focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                      />
                      <button type="button" onClick={() => setShowKey(v => !v)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/50 transition-colors">
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button onClick={saveKey} disabled={!key.trim() || savingKey}
                      className="h-11 px-5 rounded-xl bg-[#0a84ff] hover:bg-[#2a94ff] text-white text-[14px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2 flex-shrink-0">
                      {savingKey ? <Loader2 size={14} className="animate-spin" /> : keySaved ? <Check size={14} /> : null}
                      {keySaved ? 'Saved' : 'Save'}
                    </button>
                  </div>
                  {keyError && (
                    <p className="text-[13px] text-[#ff453a] flex items-center gap-2 mt-3">
                      <AlertTriangle size={13} />{keyError}
                    </p>
                  )}
                  <p className="text-[13px] text-white/25 mt-4">
                    Get yours at{' '}
                    <a href="https://vibecode.dev/settings" target="_blank" rel="noreferrer" className="text-[#0a84ff] hover:underline">
                      vibecode.dev/settings
                    </a>
                  </p>
                </div>
              </Card>
            </div>
          )}

          {/* ── PREFERENCES ── */}
          {tab === 'preferences' && settings && (
            <div className="space-y-5">
              <Card>
                <div className="px-6 pt-5 pb-2">
                  <p className="text-[12px] font-semibold text-white/30 uppercase tracking-widest">Editor</p>
                </div>
                <PrefRow label="Font size" hint="Editor font size in pixels" first>
                  <input type="number" min="10" max="24"
                    value={settings.editor?.fontSize ?? 13}
                    onChange={e => patch('editor', { fontSize: +e.target.value })}
                    className="w-16 h-10 rounded-lg bg-[#0d0d0d] border border-white/[0.08] text-[14px] text-white text-center focus:outline-none focus:border-[#0a84ff]/50 transition-colors"
                  />
                </PrefRow>
                <PrefRow label="Word wrap" hint="Wrap long lines">
                  <Toggle value={settings.editor?.wordWrap ?? true} onChange={v => patch('editor', { wordWrap: v })} />
                </PrefRow>
                <PrefRow label="Minimap" hint="Show code overview panel">
                  <Toggle value={settings.editor?.minimap ?? false} onChange={v => patch('editor', { minimap: v })} />
                </PrefRow>
              </Card>

              <Card>
                <div className="px-6 pt-5 pb-2">
                  <p className="text-[12px] font-semibold text-white/30 uppercase tracking-widest">Chat</p>
                </div>
                <PrefRow label="Default model" hint="AI model for new sessions" first>
                  <select value={settings.chat?.defaultModel ?? 'claude-sonnet-4-6'}
                    onChange={e => patch('chat', { defaultModel: e.target.value })}
                    className="h-10 rounded-lg bg-[#0d0d0d] border border-white/[0.08] text-[14px] text-white px-3 focus:outline-none focus:border-[#0a84ff]/50 transition-colors">
                    {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </PrefRow>
                <PrefRow label="Auto-scroll" hint="Follow new messages as they stream">
                  <Toggle value={settings.chat?.autoScroll ?? true} onChange={v => patch('chat', { autoScroll: v })} />
                </PrefRow>
              </Card>

              <button onClick={saveSettings} disabled={saving || saved}
                className={cn(
                  'flex items-center gap-2 h-11 px-5 rounded-xl text-[14px] font-semibold transition-all active:scale-95',
                  saved ? 'bg-[#30d158] text-white' : 'bg-[#0a84ff] hover:bg-[#2a94ff] text-white disabled:opacity-40'
                )}>
                {saving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : null}
                {saved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          )}

          {tab === 'preferences' && !settings && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={20} className="text-white/15 animate-spin" />
            </div>
          )}

          {/* ── ABOUT ── */}
          {tab === 'about' && (
            <div className="space-y-5">
              <Card>
                <div className="flex flex-col items-center text-center px-8 py-12">
                  <div className="w-14 h-14 rounded-xl bg-[#0a84ff] flex items-center justify-center mb-5">
                    <Zap size={24} className="text-white" strokeWidth={2.5} />
                  </div>
                  <p className="text-[18px] font-bold text-white mb-2">Vibecode Studio</p>
                  <p className="text-[14px] text-white/35 mb-5">AI Development Environment</p>
                  <span className="px-3 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07] text-[13px] font-mono text-white/30">
                    v0.1.0
                  </span>
                </div>
              </Card>

              <Card>
                {[
                  { label: 'Website',       href: 'https://vibecode.dev' },
                  { label: 'Documentation', href: 'https://vibecode.dev/docs' },
                  { label: 'Support',       href: 'https://vibecode.dev/support' },
                ].map((link, i, arr) => (
                  <a key={link.href} href={link.href} target="_blank" rel="noreferrer"
                    className={cn('flex items-center justify-between px-6 py-4 hover:bg-white/[0.03] transition-colors group', i < arr.length - 1 && 'border-b border-white/[0.05]')}>
                    <span className="text-[15px] text-white/55 group-hover:text-white/80 transition-colors">{link.label}</span>
                    <ExternalLink size={14} className="text-white/20 group-hover:text-white/40 transition-colors" />
                  </a>
                ))}
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
