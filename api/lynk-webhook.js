import { apiHandler, processLynkWebhook, sendJson } from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  sendJson(response, 200, await processLynkWebhook(request))
}, ['POST'])
