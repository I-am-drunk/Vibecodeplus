import { createServer, type Server } from 'net'
import { sshManager } from './manager.ts'

type Tunnel = { localPort: number; server: Server }

class PortForwardManager {
  private tunnels = new Map<string, Map<number, Tunnel>>()
  private nextPort = 18001

  async detectPorts(projectId: string): Promise<number[]> {
    try {
      const output = await sshManager.exec(projectId,
        `ss -tlnp 2>/dev/null | grep LISTEN | awk '{print $4}' | rev | cut -d: -f1 | rev | sort -un`
      )
      return output.split('\n')
        .map(p => parseInt(p.trim()))
        .filter(p => !isNaN(p) && p > 0 && p < 65536 && p !== 22)
    } catch { return [] }
  }

  async forward(projectId: string, remotePort: number): Promise<number> {
    const projectTunnels = this.tunnels.get(projectId) ?? new Map()
    const existing = projectTunnels.get(remotePort)
    if (existing) return existing.localPort

    const localPort = this.nextPort++
    const conn = await sshManager.getConnection(projectId).catch(() => null)
    if (!conn) throw new Error('SSH not connected')

    const server = createServer((socket) => {
      conn.forwardOut('127.0.0.1', localPort, 'localhost', remotePort, (err, stream) => {
        if (err) { socket.end(); return }
        socket.pipe(stream)
        stream.pipe(socket)
        socket.on('error', () => stream.end())
        stream.on('error', () => socket.end())
      })
    })

    await new Promise<void>((resolve, reject) => {
      server.listen(localPort, '127.0.0.1', () => resolve())
      server.on('error', reject)
    })

    projectTunnels.set(remotePort, { localPort, server })
    this.tunnels.set(projectId, projectTunnels)
    return localPort
  }

  isForwarded(projectId: string, remotePort: number): boolean {
    return this.tunnels.get(projectId)?.has(remotePort) ?? false
  }

  getForwardedPorts(projectId: string): { remote: number; local: number }[] {
    const tunnels = this.tunnels.get(projectId)
    if (!tunnels) return []
    return Array.from(tunnels.entries()).map(([remote, { localPort }]) => ({ remote, local: localPort }))
  }

  async stopAll(projectId?: string) {
    const targets = projectId ? [[projectId, this.tunnels.get(projectId)]] : Array.from(this.tunnels.entries())
    for (const [pid, tunnels] of targets as [string, Map<number, Tunnel> | undefined][]) {
      if (!tunnels) continue
      for (const [, { server }] of tunnels) server.close()
      this.tunnels.delete(pid)
    }
  }
}

export const portForwardManager = new PortForwardManager()
