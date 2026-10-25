import {
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process'
import { createInterface } from 'node:readline'

interface Content { type: string; text?: string; data?: string }
export interface ToolResult { content: Content[]; isError?: boolean }
export interface McpConfiguration { command: string; args: string[]; env: Record<string, string> }

/** Exercises real stdio rather than directly calling Tauri or preloading editor state. */
export class McpClient {
  #process: ChildProcessWithoutNullStreams
  #id = 0
  #pending = new Map<number, {
    resolve(value: unknown): void
    reject(error: Error): void
    timer: ReturnType<typeof setTimeout>
  }>()
  constructor(config: McpConfiguration) {
    this.#process = spawn(config.command, config.args, { env: { ...process.env, ...config.env }, windowsHide: true })
    const lines = createInterface({ input: this.#process.stdout })
    lines.on('line', (line) => {
      const response = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown }
      if (response.id === undefined) return
      const pending = this.#pending.get(response.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.#pending.delete(response.id)
      if (response.error) pending.reject(new Error('MCP protocol error'))
      else pending.resolve(response.result)
    })
    this.#process.stderr.resume()
    const fail = () => {
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('MCP exited'))
      }
      this.#pending.clear()
    }
    this.#process.on('error', fail)
    this.#process.on('exit', fail)
  }
  async initialize(): Promise<void> {
    await this.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'cute-screen-e2e', version: '1.0.0' } })
    this.#process.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  }
  request(
    method: string,
    params: unknown,
  ): Promise<unknown> {
    const id = ++this.#id
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`MCP timeout: ${method}`))
      }, 40000)
      this.#pending.set(id, { resolve, reject, timer })
      this.#process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  }
  async call(
    name: string,
    args: unknown = {},
  ): Promise<ToolResult> {
    return await this.request('tools/call', { name, arguments: args }) as ToolResult
  }
  async data(
    name: string,
    args: unknown = {},
  ): Promise<Record<string, unknown>> {
    const result = await this.call(name, args)
    const data = JSON.parse(result.content.find((c) => c.type === 'text')?.text ?? '{}') as Record<string, unknown>
    if (result.isError || data.error) throw new Error(`${name}: ${String(data.error ?? 'tool failed')}`)
    return data
  }
  async close(): Promise<void> {
    this.#process.stdin.end()
    if (this.#process.exitCode !== null) return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.#process.kill()
        resolve()
      }, 1500)
      this.#process.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
