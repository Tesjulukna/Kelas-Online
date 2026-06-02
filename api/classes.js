import {
  apiHandler,
  fetchClasses,
  readJson,
  replaceClasses,
  requireUser,
  sendJson,
} from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  if (request.method === 'GET') {
    sendJson(response, 200, await fetchClasses())
    return
  }

  await requireUser(request, 'admin')
  const payload = await readJson(request)

  sendJson(response, 200, await replaceClasses(payload.classes || payload))
}, ['GET', 'PUT'])
