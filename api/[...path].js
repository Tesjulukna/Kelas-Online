import {
  apiHandler,
  createBackup,
  createMember,
  createSubmission,
  createSupportTicket,
  createTripayCheckout,
  deleteMember,
  deleteSubmission,
  deleteSupportTicket,
  fetchClasses,
  fetchMembers,
  fetchSubmissions,
  fetchSupportTickets,
  fetchWebsiteSettings,
  login,
  logout,
  prepareFileUpload,
  prepareVideoUpload,
  processLynkWebhook,
  processTripayWebhook,
  readJson,
  redirectProtectedVideo,
  replaceClasses,
  replaceWebsiteSettings,
  requireUser,
  restoreBackup,
  sendJson,
  trackProgress,
  updateMember,
  updateProfile,
  updateSubmission,
  updateSupportTicket,
} from '../api-lib/supabase.js'

function getRoute(request) {
  const url = new URL(request.url || '/', 'http://localhost')
  const pathname = url.pathname.replace(/^\/api\/?/, '').replace(/\.php$/i, '')
  const route = pathname.split('/').filter(Boolean)[0] || 'classes'

  if (route === 'settings') {
    url.searchParams.set('resource', 'settings')
    return { route: 'classes', url }
  }

  if (route === 'backup') {
    url.searchParams.set('resource', 'backup')
    return { route: 'classes', url }
  }

  return { route, url }
}

async function handleClasses(request, response, url) {
  const resource = url.searchParams.get('resource') || 'classes'

  if (resource === 'settings') {
    if (request.method === 'GET') {
      sendJson(response, 200, await fetchWebsiteSettings())
      return
    }

    await requireUser(request, 'admin')
    const payload = await readJson(request)

    sendJson(response, 200, await replaceWebsiteSettings(payload.settings || payload))
    return
  }

  if (resource === 'backup') {
    await requireUser(request, 'admin')

    if (request.method === 'GET') {
      const backup = await createBackup()
      const fileName = `backup-ibnucreative-${new Date().toISOString().slice(0, 10)}.json`

      response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
      sendJson(response, 200, backup)
      return
    }

    if (request.method === 'POST') {
      const payload = await readJson(request)

      sendJson(response, 200, await restoreBackup(payload))
      return
    }

    sendJson(response, 405, { message: 'Method tidak diizinkan.' })
    return
  }

  if (request.method === 'GET') {
    sendJson(response, 200, await fetchClasses())
    return
  }

  if (request.method !== 'PUT') {
    sendJson(response, 405, { message: 'Method tidak diizinkan.' })
    return
  }

  await requireUser(request, 'admin')
  const payload = await readJson(request)

  sendJson(response, 200, await replaceClasses(payload.classes || payload))
}

async function handleMembers(request, response, url) {
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
}

async function handleSupport(request, response, url) {
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
}

async function handleSubmissions(request, response, url) {
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
}

async function routeRequest(request, response) {
  const { route, url } = getRoute(request)

  if (route === 'classes') {
    await handleClasses(request, response, url)
    return
  }

  if (route === 'members') {
    await handleMembers(request, response, url)
    return
  }

  if (route === 'support') {
    await handleSupport(request, response, url)
    return
  }

  if (route === 'submissions') {
    await handleSubmissions(request, response, url)
    return
  }

  if (route === 'progress') {
    const user = await requireUser(request, 'member')

    sendJson(response, 200, await trackProgress(user, await readJson(request)))
    return
  }

  if (route === 'profile') {
    const user = await requireUser(request)

    if (request.method === 'GET') {
      sendJson(response, 200, { session: user })
      return
    }

    sendJson(response, 200, await updateProfile(user, await readJson(request)))
    return
  }

  if (route === 'login') {
    sendJson(response, 200, await login(await readJson(request), request))
    return
  }

  if (route === 'logout') {
    sendJson(response, 200, await logout(request))
    return
  }

  if (route === 'upload-file') {
    sendJson(response, 200, await prepareFileUpload(request, await readJson(request)))
    return
  }

  if (route === 'upload-video') {
    sendJson(response, 200, await prepareVideoUpload(request, await readJson(request)))
    return
  }

  if (route === 'video') {
    await redirectProtectedVideo(request, response)
    return
  }

  if (route === 'lynk-webhook') {
    sendJson(response, 200, await processLynkWebhook(request))
    return
  }

  if (route === 'tripay-checkout') {
    sendJson(response, 200, await createTripayCheckout(request))
    return
  }

  if (route === 'tripay-webhook') {
    sendJson(response, 200, await processTripayWebhook(request))
    return
  }

  sendJson(response, 404, { message: 'Endpoint tidak ditemukan.' })
}

export default apiHandler(routeRequest, ['GET', 'POST', 'PUT', 'DELETE'])
