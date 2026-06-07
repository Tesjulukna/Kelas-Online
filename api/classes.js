import {
  apiHandler,
  createBackup,
  fetchClasses,
  fetchWebsiteSettings,
  readJson,
  replaceClasses,
  replaceWebsiteSettings,
  requireUser,
  restoreBackup,
  sendJson,
} from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  const resource = url.searchParams.get('resource') || 'classes'

  if (resource === 'settings') {
    if (request.method === 'GET') {
      sendJson(response, 200, await fetchWebsiteSettings())
      return
    }

    await requireUser(request, 'admin')
    const payload = await readJson(request)

    sendJson(response, 200, await replaceWebsiteSettings(payload.settings || payload))
    return
  }

  if (resource === 'backup') {
    await requireUser(request, 'admin')

    if (request.method === 'GET') {
      const backup = await createBackup()
      const fileName = `backup-ibnucreative-${new Date().toISOString().slice(0, 10)}.json`

      response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      sendJson(response, 200, backup)
      return
    }

    if (request.method === 'POST') {
      const payload = await readJson(request)

      sendJson(response, 200, await restoreBackup(payload))
      return
    }

    sendJson(response, 405, { message: 'Method tidak diizinkan.' })
    return
  }

  if (request.method === 'GET') {
    sendJson(response, 200, await fetchClasses())
    return
  }

  if (request.method !== 'PUT') {
    sendJson(response, 405, { message: 'Method tidak diizinkan.' })
    return
  }

  await requireUser(request, 'admin')
  const payload = await readJson(request)

  sendJson(response, 200, await replaceClasses(payload.classes || payload))
}, ['GET', 'POST', 'PUT'])
