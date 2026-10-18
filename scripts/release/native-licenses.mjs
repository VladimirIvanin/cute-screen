import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { run } from './io.mjs'

export async function nativeLicenses(
  report,
  output,
) {
  const libraries = [...new Set(Object.values(report.checks).flatMap((check) => check.packagedFiles)
    .filter((entry) => /\.so(?:\.|$)/u.test(entry.path)).map((entry) => path.basename(entry.path)))].sort()
  const owners = new Set()
  for (const library of libraries) {
    const matches = run('dpkg-query', ['-S', `*/${library}`])
    const owner = matches.split('\n')[0].split(': ')[0]
    if (!owner) throw new Error(`No native license provenance for ${library}`)
    owners.add(owner)
  }
  const texts = [`Bundled native library provenance for ${report.id}\n${libraries.join('\n')}\n`]
  for (const owner of [...owners].sort()) {
    const metadata = run('dpkg-query', ['-W', '-f', '${Package} ${Version} ${Homepage}\n', owner])
    const copyright = await readFile(`/usr/share/doc/${owner.split(':')[0]}/copyright`, 'utf8')
    texts.push(`\n===== ${metadata} =====\n${copyright}`)
  }
  await writeFile(path.join(output, `${report.id}-native-licenses.txt`), texts.join('\n'))
}
