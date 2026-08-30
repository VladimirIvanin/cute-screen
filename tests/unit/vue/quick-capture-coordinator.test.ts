import { describe, expect, it, vi } from 'vitest'

import { useQuickCaptureCoordinator } from '../../../apps/desktop/src/use-quick-capture-coordinator'

const draft = {
  version: 1 as const,
  draftId: 'draft-1',
  correlationId: 'capture-1',
  imageToken: 'image-1',
  width: 800,
  height: 600,
  selection: { x: 0, y: 0, width: 800, height: 600 },
  canExpandSelection: true,
  selectionPending: true,
}

describe('quick capture coordinator', () => {
  it('projects selecting through durable commit without inventing a second draft', async () => {
    const bridge = {
      quickCaptureConfirmSelection: vi.fn().mockResolvedValue(true),
      quickCapturePreparePng: vi.fn().mockResolvedValue(undefined),
      quickCaptureCommit: vi.fn().mockResolvedValue({
        version: 2,
        correlationId: draft.correlationId,
        outcome: 'captured',
      }),
      quickCaptureCancel: vi.fn().mockResolvedValue(true),
    }
    const coordinator = useQuickCaptureCoordinator(bridge)
    coordinator.projectDraft(draft)
    expect(coordinator.phase.value).toBe('selecting')

    await coordinator.confirmSelection(draft.draftId, draft.selection)
    expect(coordinator.phase.value).toBe('editing')

    await coordinator.commit(
      draft.draftId,
      new Uint8Array([1]),
      '{}',
      'copied',
      draft.selection,
    )
    expect(coordinator.phase.value).toBe('committed')
    expect(bridge.quickCapturePreparePng).toHaveBeenCalledOnce()
    expect(bridge.quickCaptureCommit).toHaveBeenCalledOnce()
  })

  it('returns to editing when materialization fails before commit', async () => {
    const bridge = {
      quickCaptureConfirmSelection: vi.fn().mockResolvedValue(true),
      quickCapturePreparePng: vi.fn().mockRejectedValue(new Error('encode')),
      quickCaptureCommit: vi.fn(),
      quickCaptureCancel: vi.fn().mockResolvedValue(true),
    }
    const coordinator = useQuickCaptureCoordinator(bridge)
    coordinator.projectDraft({ ...draft, selectionPending: false })

    await expect(
      coordinator.commit(
        draft.draftId,
        new Uint8Array([1]),
        '{}',
        'saved',
        draft.selection,
      ),
    ).rejects.toThrow('encode')
    expect(coordinator.phase.value).toBe('editing')
    expect(bridge.quickCaptureCommit).not.toHaveBeenCalled()
  })
})
