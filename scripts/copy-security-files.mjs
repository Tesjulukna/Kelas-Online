import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = [
  ['public/.htaccess', 'dist/.htaccess'],
]

await Promise.all(
  files.map(async ([source, target]) => {
    const sourcePath = resolve(rootDir, source)
    const targetPath = resolve(rootDir, target)

    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
  }),
)
