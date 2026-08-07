import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

import App from '../../../apps/desktop/src/App.vue'
import type { DesktopBridge } from '../../../apps/desktop/src/desktop-bridge'

function bridgeWithPing(ping: DesktopBridge['ping']): DesktopBridge {
  return { ping }
}

describe('foundation screen', () => {
  it('mounts from clean state without making a product claim', () => {
    render(App, {
      props: {
        bridge: bridgeWithPing(vi.fn()),
      },
    })

    expect(
      screen.getByRole('heading', { name: 'Cute Screen workspace is ready' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('performs the typed ping flow and exposes a disabled loading state', async () => {
    let resolvePing:
      ((value: { message: 'pong'; protocolVersion: 1 }) => void) | undefined
    const ping = vi.fn(
      () =>
        new Promise<{ message: 'pong'; protocolVersion: 1 }>((resolve) => {
          resolvePing = resolve
        }),
    )

    render(App, { props: { bridge: bridgeWithPing(ping) } })
    const button = screen.getByRole('button', { name: 'Check desktop bridge' })
    await fireEvent.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Checking…')

    resolvePing?.({ message: 'pong', protocolVersion: 1 })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Desktop bridge ready · protocol 1',
    )
    expect(ping).toHaveBeenCalledTimes(1)
  })

  it('shows a recoverable error and retries', async () => {
    const ping = vi
      .fn<DesktopBridge['ping']>()
      .mockRejectedValueOnce(new Error('IPC unavailable'))
      .mockResolvedValueOnce({ message: 'pong', protocolVersion: 1 })

    render(App, { props: { bridge: bridgeWithPing(ping) } })
    await fireEvent.click(
      screen.getByRole('button', { name: 'Check desktop bridge' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'IPC unavailable',
    )
    await fireEvent.click(
      screen.getByRole('button', { name: 'Retry desktop bridge' }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Desktop bridge ready',
    )
    expect(ping).toHaveBeenCalledTimes(2)
  })
})
