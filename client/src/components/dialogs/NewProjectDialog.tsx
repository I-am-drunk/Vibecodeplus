import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { useProjectsStore } from '../../store/projects'
import { MODELS } from '../../lib/utils'
import { addClientLog } from '../../lib/serverLogs'

const TEMPLATES = [
  { value: 'webapp', label: 'Web App', description: 'Full-stack web application' },
  { value: 'mobile', label: 'Mobile', description: 'Mobile application' },
  { value: 'openclaw', label: 'OpenClaw', description: 'OpenClaw project' },
]

interface Props { open: boolean; onClose: () => void }

export function NewProjectDialog({ open, onClose }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [template, setTemplate] = useState('webapp')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { createProject } = useProjectsStore()
  const navigate = useNavigate()

  addClientLog('NewProjectDialog', 'dialog rendered', { open, name, template, model, loading })

  const handleCreate = async () => {
    addClientLog('NewProjectDialog', 'handleCreate called', { name, description, template, model })
    if (!name.trim()) {
      addClientLog('NewProjectDialog', 'handleCreate aborted - empty name')
      setError('Project name is required')
      return
    }
    setLoading(true)
    setError('')
    addClientLog('NewProjectDialog', 'calling createProject', { name: name.trim(), template, model })
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        template,
        defaultModel: model,
      })
      addClientLog('NewProjectDialog', 'project created successfully', { id: project.id, name: project.name })
      onClose()
      addClientLog('NewProjectDialog', 'dialog closed, navigating to workspace', { projectId: project.id })
      navigate(`/workspace/${project.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      addClientLog('NewProjectDialog', 'createProject failed', { error: msg })
      setError(msg)
    } finally {
      setLoading(false)
      addClientLog('NewProjectDialog', 'loading state cleared')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New Project" description="Create a new Vibecode project">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-[12px] text-[rgba(235,235,245,0.6)] font-medium block mb-1.5">Project Name *</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="my-awesome-project"
            className="w-full h-9 rounded-[8px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)] text-[13px] text-white
              placeholder:text-[rgba(235,235,245,0.25)] px-3 focus:outline-none focus:border-[#0a84ff]"
            autoFocus
          />
          {error && <p className="text-[11px] text-[#ff453a] mt-1">{error}</p>}
        </div>

        <div>
          <label className="text-[12px] text-[rgba(235,235,245,0.6)] font-medium block mb-1.5">Description</label>
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What are you building?"
            className="w-full h-9 rounded-[8px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)] text-[13px] text-white
              placeholder:text-[rgba(235,235,245,0.25)] px-3 focus:outline-none focus:border-[#0a84ff]"
          />
        </div>

        <div>
          <label className="text-[12px] text-[rgba(235,235,245,0.6)] font-medium block mb-1.5">Template</label>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map(t => (
              <button key={t.value} type="button" onClick={() => setTemplate(t.value)}
                className={`p-3 rounded-[10px] border text-left transition-all ${template === t.value
                  ? 'border-[#0a84ff] bg-[rgba(10,132,255,0.1)]'
                  : 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]'}`}>
                <div className="text-[13px] font-medium text-white">{t.label}</div>
                <div className="text-[11px] text-[rgba(235,235,245,0.4)] mt-0.5">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[12px] text-[rgba(235,235,245,0.6)] font-medium block mb-1.5">Default Model</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full h-9 rounded-[8px] bg-[#1c1c1e] border border-[rgba(255,255,255,0.1)] text-[13px] text-white px-3 focus:outline-none"
          >
            {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={handleCreate} loading={loading} className="flex-1">
            Create Project
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
