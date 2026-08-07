<script setup lang="ts">
import { EditorShell, type ShellActionAdapter } from '@cute-screen/editor-vue'

const fixture =
  import.meta.env.VITE_TEST_HARNESS === 'true'
    ? ((new URLSearchParams(window.location.search).get('m02') as
        'empty' | 'error' | 'loading' | 'ready' | null) ?? 'empty')
    : 'empty'

const testActions: ShellActionAdapter | undefined =
  import.meta.env.VITE_TEST_HARNESS === 'true'
    ? {
        run: (action, signal) =>
          new Promise((resolve, reject) => {
            const timer = window.setTimeout(
              () => resolve(`${action} completed`),
              150,
            )
            signal.addEventListener(
              'abort',
              () => {
                window.clearTimeout(timer)
                reject(new DOMException('Cancelled', 'AbortError'))
              },
              { once: true },
            )
          }),
      }
    : undefined
</script>

<template>
  <EditorShell :fixture="fixture" :actions="testActions" />
</template>
