import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = [
  ['public/.htaccess', 'dist/.htaccess'],
  ['public/favicon-32.png', 'dist/favicon-32.png'],
  ['public/favicon.ico', 'dist/favicon.ico'],
  ['public/apple-touch-icon.png', 'dist/apple-touch-icon.png'],
]

await Promise.all(
  files.map(async ([source, target]) => {
    const sourcePath = resolve(rootDir, source)
    const targetPath = resolve(rootDir, target)

    await mkdir(dirname(targetPath), { recursive: true })
    await copyFile(sourcePath, targetPath)
  }),
)
