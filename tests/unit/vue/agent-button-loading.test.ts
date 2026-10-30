import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  expect,
  it,
  vi,
} from 'vitest'
import { createEditorShellPinia } from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'

it('announces pending agent opening, blocks repeats and permits retry after rejection', async () => {
  localStorage.clear()
  let rejectOpen: (error: Error) => void = () => undefined
  const connectAgent = vi.fn<() => Promise<void>>()
    .mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectOpen = reject
    }))
    .mockResolvedValueOnce(undefined)
  render(EditorShell, { props: { connectAgent }, global: { plugins: [createEditorShellPinia()] } })
  const button = screen.getByRole('button', { name: 'Connect agent' })
  expect(button).toBeEnabled()
  await fireEvent.click(button)
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
  await fireEvent.click(button)
  expect(connectAgent).toHaveBeenCalledTimes(1)
  rejectOpen(new Error('Settings window failed'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Settings window failed')
  expect(button).toBeEnabled()
  expect(button).toHaveAttribute('aria-busy', 'false')
  await fireEvent.click(button)
  await vi.waitFor(() => expect(button).toBeEnabled())
  expect(connectAgent).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
