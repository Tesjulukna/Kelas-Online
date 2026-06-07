import {
  apiHandler,
  fetchWebsiteSettings,
  readJson,
  replaceWebsiteSettings,
  requireUser,
  sendJson,
} from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  if (request.method === 'GET') {
    sendJson(response, 200, await fetchWebsiteSettings())
    return
  }

  await requireUser(request, 'admin')
  const payload = await readJson(request)

  sendJson(response, 200, await replaceWebsiteSettings(payload.settings || payload))
}, ['GET', 'PUT'])
