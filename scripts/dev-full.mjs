import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const viteArgs = process.argv.slice(2)
const children = []
let shuttingDown = false

function start(name, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  children.push(child)

  child.on('exit', (code) => {
    if (shuttingDown) {
      return
    }

    shuttingDown = true
    children.forEach((item) => {
      if (item !== child && !item.killed) {
        item.kill()
      }
    })
    process.exitCode = code ?? 0
    console.log(`${name} berhenti.`)
  })

  return child
}

function shutdown() {
  shuttingDown = true
  children.forEach((child) => {
    if (!child.killed) {
      child.kill()
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

start('Data API', npmCommand, ['run', 'api'])
start('Vite', npmCommand, ['run', 'dev:vite', '--', ...viteArgs])
