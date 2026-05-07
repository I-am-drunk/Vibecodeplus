import { useChatStore } from '../../store/chat'
import { Select } from '../ui/Select'
import { MODELS } from '../../lib/utils'

export function ModelSelector() {
  const { model, setModel } = useChatStore()
  return (
    <Select
      value={model}
      onChange={setModel}
      options={MODELS}
      size="sm"
      className="w-44"
    />
  )
}
