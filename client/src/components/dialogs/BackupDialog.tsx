import { useEffect, useState } from 'react'
import { CloudUpload, RotateCcw, Trash2 } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import { formatRelative } from '../../lib/utils'

interface Props { open: boolean; onClose: () => void; projectId: string }

export function BackupDialog({ open, onClose, projectId }: Props) {
  const [backups, setBackups] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setLoading(true)
    try { const { backups } = await api.listBackups(projectId); setBackups(backups) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (open) load() }, [open])

  const createBackup = async () => {
    setCreating(true)
    try { await api.createBackup(projectId); await load() }
    finally { setCreating(false) }
  }

  const restore = async (backupId: string) => {
    if (!confirm('Restore this backup? Current files will be overwritten.')) return
    await api.restoreBackup(projectId, backupId)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Backups" description="Manage workspace snapshots" width={520}>
      <div className="flex flex-col gap-4">
        <Button variant="outline" onClick={createBackup} loading={creating}>
          <CloudUpload size={14} /> Create Backup Now
        </Button>

        <div className="border border-[rgba(255,255,255,0.08)] rounded-[10px] overflow-hidden">
          {loading ? (
            <div className="py-8 text-center text-[rgba(235,235,245,0.3)] text-[13px]">Loading...</div>
          ) : backups.length === 0 ? (
            <div className="py-8 text-center text-[rgba(235,235,245,0.3)] text-[13px]">No backups yet</div>
          ) : (
            <div className="divide-y divide-[rgba(255,255,255,0.07)]">
              {backups.map((b: any) => (
                <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <p className="text-[13px] text-white">{b.label ?? `Backup ${b.id}`}</p>
                    <p className="text-[11px] text-[rgba(235,235,245,0.4)]">{formatRelative(b.created_at)}</p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => restore(b.id)}>
                    <RotateCcw size={13} /> Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  )
}
