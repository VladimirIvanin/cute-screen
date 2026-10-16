import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** tsc retains deleted modules; an old scene.js shadows the current scene/index.js. */
export async function cleanPackageOutputs(root) {
  await Promise.all(['editor-core', 'editor-renderer'].map((name) =>
    rm(path.join(root, 'packages', name, 'dist'), { recursive: true, force: true })))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cleanPackageOutputs(process.cwd())
}
