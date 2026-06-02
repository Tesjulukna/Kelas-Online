import {
  apiHandler,
  createSupportTicket,
  deleteSupportTicket,
  fetchSupportTickets,
  readJson,
  requireUser,
  sendJson,
  updateSupportTicket,
} from '../api-lib/supabase.js'

export default apiHandler(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost')
  const user = await requireUser(request)

  if (request.method === 'GET') {
    sendJson(response, 200, await fetchSupportTickets(user))
    return
  }

  if (request.method === 'POST') {
    sendJson(response, 200, await createSupportTicket(user, await readJson(request)))
    return
  }

  if (request.method === 'PUT') {
    sendJson(response, 200, await updateSupportTicket(user, await readJson(request)))
    return
  }

  await requireUser(request, 'admin')
  sendJson(response, 200, await deleteSupportTicket(url.searchParams.get('id') || ''))
}, ['GET', 'POST', 'PUT', 'DELETE'])
