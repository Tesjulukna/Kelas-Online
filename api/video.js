import { apiHandler, redirectProtectedVideo } from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  await redirectProtectedVideo(request, response)
}, ['GET'])
