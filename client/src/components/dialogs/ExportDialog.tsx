import { Download } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { api } from '../../lib/api'
import { useState } from 'react'

interface Props { open: boolean; onClose: () => void; projectId: string }

export function ExportDialog({ open, onClose, projectId }: Props) {
  const [loading, setLoading] = useState(false)

  const doExport = async () => {
    setLoading(true)
    try {
      await api.createBackup(projectId)
      alert('Workspace exported successfully. Check the backups section.')
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Export Workspace" width={400}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-[rgba(235,235,245,0.6)]">
          This will create a compressed archive of your entire workspace and save it locally.
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={doExport} loading={loading} className="flex-1">
            <Download size={14} /> Export
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
