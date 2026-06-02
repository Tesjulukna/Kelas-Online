import { apiHandler, prepareVideoUpload, readJson, sendJson } from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  const payload = await readJson(request)

  sendJson(response, 200, await prepareVideoUpload(request, payload))
}, ['POST'])
