import { apiHandler, prepareFileUpload, readJson, sendJson } from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  const payload = await readJson(request)

  sendJson(response, 200, await prepareFileUpload(request, payload))
}, ['POST'])
