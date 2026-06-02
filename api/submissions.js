import {
  apiHandler,
  createSubmission,
  deleteSubmission,
  fetchSubmissions,
  readJson,
  requireUser,
  sendJson,
  updateSubmission,
} from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  const user = await requireUser(request)

  if (request.method === 'GET') {
    sendJson(response, 200, await fetchSubmissions(user))
    return
  }

  if (request.method === 'POST') {
    const member = await requireUser(request, 'member')
    sendJson(response, 200, await createSubmission(member, await readJson(request)))
    return
  }

  await requireUser(request, 'admin')

  if (request.method === 'PUT') {
    sendJson(response, 200, await updateSubmission(await readJson(request)))
    return
  }

  sendJson(response, 200, await deleteSubmission(url.searchParams.get('id') || ''))
}, ['GET', 'POST', 'PUT', 'DELETE'])
