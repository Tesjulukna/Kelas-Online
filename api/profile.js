import { apiHandler, requireUser, readJson, sendJson, updateProfile } from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  const user = await requireUser(request)

  if (request.method === 'GET') {
    sendJson(response, 200, { session: user })
    return
  }

  sendJson(response, 200, await updateProfile(user, await readJson(request)))
}, ['GET', 'PUT'])
