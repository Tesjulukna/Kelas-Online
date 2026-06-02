import { apiHandler, logout, sendJson } from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  sendJson(response, 200, await logout(request))
}, ['GET', 'POST'])
