import {
  apiHandler,
  createBackup,
  readJson,
  requireUser,
  restoreBackup,
  sendJson,
} from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  await requireUser(request, 'admin')

  if (request.method === 'GET') {
    const backup = await createBackup()
    const fileName = `backup-ibnucreative-${new Date().toISOString().slice(0, 10)}.json`

    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    sendJson(response, 200, backup)
    return
  }

  const payload = await readJson(request)

  sendJson(response, 200, await restoreBackup(payload))
}, ['GET', 'POST'])
