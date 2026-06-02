import {
  apiHandler,
  createMember,
  deleteMember,
  fetchMembers,
  readJson,
  requireUser,
  sendJson,
  updateMember,
} from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')

  await requireUser(request)

  if (request.method === 'GET') {
    sendJson(response, 200, await fetchMembers())
    return
  }

  await requireUser(request, 'admin')

  if (request.method === 'POST') {
    sendJson(response, 200, await createMember(await readJson(request)))
    return
  }

  if (request.method === 'PUT') {
    sendJson(response, 200, await updateMember(await readJson(request)))
    return
  }

  sendJson(response, 200, await deleteMember(url.searchParams.get('id') || ''))
}, ['GET', 'POST', 'PUT', 'DELETE'])
