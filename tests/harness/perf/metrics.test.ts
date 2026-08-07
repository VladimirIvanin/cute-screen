import {
  createRenderSceneSnapshot,
  type RenderNode,
} from '@cute-screen/editor-core'
import {
  drawNodesCanvasKit,
  type CanvasKitApi,
} from '@cute-screen/editor-renderer'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

import { measureScenario, percentile } from './metrics'

const require = createRequire(import.meta.url)
const CanvasKitInit =
  require('../../../packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.js') as (options: {
    locateFile: () => string
  }) => Promise<CanvasKitApi>
const reports: unknown[] = []
let canvasKit: CanvasKitApi

beforeAll(async () => {
  canvasKit = await CanvasKitInit({
    locateFile: () =>
      path.resolve(
        'packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm',
      ),
  })
})

function nodes(width: number, height: number, count: number): RenderNode[] {
  return Array.from({ length: count }, (_, index) => {
    const x = (index * 83) % Math.max(1, width - 160)
    const y = (index * 47) % Math.max(1, height - 100)
    switch (index % 3) {
      case 0:
        return {
          kind: 'rect' as const,
          id: `rect-${index}`,
          x,
          y,
          width: 120,
          height: 72,
          rotation: index % 19,
          opacity: 0.82,
          visible: true,
          fill: { red: 0.82, green: 0.24, blue: 0.18, alpha: 1 },
          stroke: { red: 0.18, green: 0.08, blue: 0.04, alpha: 1 },
          strokeWidth: 3,
        }
      case 1:
        return {
          kind: 'ellipse' as const,
          id: `ellipse-${index}`,
          centerX: x + 48,
          centerY: y + 32,
          radiusX: 48,
          radiusY: 32,
          rotation: -(index % 17),
          opacity: 0.76,
          visible: true,
          fill: { red: 0.12, green: 0.52, blue: 0.86, alpha: 1 },
        }
      default:
        return {
          kind: 'line' as const,
          id: `line-${index}`,
          x1: x,
          y1: y,
          x2: x + 140,
          y2: y + 64,
          rotation: 0,
          opacity: 1,
          visible: true,
          stroke: { red: 0.12, green: 0.7, blue: 0.4, alpha: 1 },
          strokeWidth: 6,
        }
    }
  })
}

describe('performance metrics harness self-test', () => {
  it('calculates deterministic p95 without claiming a product budget', () => {
    expect(percentile([10, 30, 20, 40, 50], 0.95)).toBe(50)
    expect(percentile([30, 10, 20], 0.5)).toBe(20)
  })

  for (const fixture of [
    {
      id: 'm01-ui-4k',
      name: '4k-500',
      width: 3840,
      height: 2160,
      nodeCount: 500,
      budget: 16.7,
    },
    {
      id: 'm01-ui-8k',
      name: '8k-1000',
      width: 7680,
      height: 4320,
      nodeCount: 1000,
      budget: 33.3,
    },
  ]) {
    it(`measures production-shaped ${fixture.name} CanvasKit redraws`, async () => {
      const manifest = JSON.parse(
        await readFile('tests/fixtures/manifest.json', 'utf8'),
      ) as { fixtures: Array<{ id: string; sha256: string }> }
      const fixtureSha256 = manifest.fixtures.find(
        (entry) => entry.id === fixture.id,
      )?.sha256
      expect(fixtureSha256).toMatch(/^[a-f0-9]{64}$/)
      const snapshot = createRenderSceneSnapshot({
        width: fixture.width,
        height: fixture.height,
        nodes: nodes(fixture.width, fixture.height, fixture.nodeCount),
      })
      const surface = canvasKit.MakeSurface(fixture.width, fixture.height)
      if (!surface)
        throw new Error(`Could not create ${fixture.name} software surface`)
      try {
        const canvas = surface.getCanvas()
        const report = measureScenario(
          {
            name: fixture.name,
            fixtureSha256: fixtureSha256!,
            width: fixture.width,
            height: fixture.height,
            nodeCount: fixture.nodeCount,
            runner: `${process.platform}/${process.arch} · ${os.cpus()[0]?.model ?? 'unknown CPU'} · CanvasKit software`,
          },
          () => {
            const start = performance.now()
            canvas.clear(canvasKit.TRANSPARENT)
            drawNodesCanvasKit(canvasKit, canvas, snapshot.nodes)
            surface.flush()
            return performance.now() - start
          },
          0,
        )
        reports.push(report)
        await mkdir('artifacts/perf', { recursive: true })
        await writeFile(
          'artifacts/perf/m01-renderer.json',
          `${JSON.stringify(reports, null, 2)}\n`,
        )
        expect(report.warmups).toBe(30)
        expect(report.measurements).toBe(120)
        expect(report.idleFrameCount).toBe(0)
        expect(report.p50).toBeGreaterThan(0)
        expect(report.p95).toBeGreaterThanOrEqual(report.p50)
        expect(report.max).toBeGreaterThanOrEqual(report.p95)
        if (process.env.CUTE_SCREEN_REFERENCE_RUNNER === '1') {
          expect(report.p95).toBeLessThanOrEqual(fixture.budget)
        }
      } finally {
        surface.dispose()
      }
    }, 120_000)
  }

  it('always rejects an idle frame, independent of runner budgets', () => {
    expect(() =>
      measureScenario(
        {
          name: 'idle',
          fixtureSha256: 'b'.repeat(64),
          width: 1,
          height: 1,
          nodeCount: 0,
          runner: 'unit-contract-runner',
        },
        () => 0,
        1,
      ),
    ).toThrow('Idle renderer scheduled 1 unexpected frames')
  })
})
