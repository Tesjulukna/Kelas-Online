import { apiHandler, readJson, requireUser, sendJson, trackProgress } from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  const user = await requireUser(request, 'member')

  sendJson(response, 200, await trackProgress(user, await readJson(request)))
}, ['POST'])
