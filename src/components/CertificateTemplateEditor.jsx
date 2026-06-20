import { useEffect, useMemo, useRef, useState } from 'react'
import {
  certificatePlaceholders,
  certificateSizePresets,
  createCertificateData,
  createDefaultCertificateTemplate,
  createImageElement,
  createQrElement,
  createShapeElement,
  createTextElement,
  downloadCertificateTemplateImage,
  downloadCertificateTemplatePdf,
  normalizeCertificateTemplate,
} from '../lib/certificateTemplate'
import { uploadStorageFile } from '../lib/storageUpload'
import CertificateTemplateCanvas from './CertificateTemplateCanvas'
import Icon from './Icon'

const uploadFileApiPath = '/api/upload-file'
const fontOptions = ['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Poppins', 'Montserrat']
const historyLimit = 40

function cloneDraft(value) {
  return JSON.parse(JSON.stringify(value))
}

function clampZoom(value) {
  return Number(Math.min(1.8, Math.max(0.15, value)).toFixed(2))
}

function pointerDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function cleanFileName(value) {
  return String(value || 'sertifikat')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sertifikat'
}

function dummyCertificateForClass(course, settings) {
  return {
    participantName: 'Ramdialta Ibnu Sajara',
    memberName: 'Ramdialta Ibnu Sajara',
    classTitle: course?.title || 'Kelas Online Digital',
    mentorName: course?.mentor || 'Ibnu Creative',
    completedAt: new Date().toISOString(),
    issuedAt: new Date().toISOString(),
    certificateId: 'IBNU-2026-DEMO',
    score: 'Lulus',
    verificationUrl:
      typeof window !== 'undefined'
        ? `${window.location.origin}/sertifikat/IBNU-2026-DEMO`
        : '',
    siteName: settings?.siteName || 'Ibnu Creative',
  }
}

function ToolbarIconButton({ icon, label, onClick, disabled = false, active = false }) {
  return (
    <button
      className={`certificate-icon-tool ${active ? 'active' : ''}`.trim()}
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}

function getClassTemplateState(activeClasses, templates, classId = '', templateId = null) {
  const course = activeClasses.find((item) => item.id === classId) || activeClasses[0] || null

  if (!course) {
    const fallbackTemplate = createDefaultCertificateTemplate('', 'Kelas Online')

    return {
      classId: '',
      templateId: '',
      draft: normalizeCertificateTemplate(fallbackTemplate),
    }
  }

  const selectedTemplate = templates.find((template) =>
    template.id === templateId && template.classId === course.id,
  )
  const fallbackTemplate = templateId === ''
    ? null
    : templates.find((template) => template.classId === course.id)
  const template = selectedTemplate || fallbackTemplate || createDefaultCertificateTemplate(course.id, course.title)

  return {
    classId: course.id,
    templateId: template.id || '',
    draft: normalizeCertificateTemplate(template, course),
  }
}

function CertificateTemplateEditor({
  classes = [],
  templates = [],
  certificates = [],
  sessionToken = '',
  settings = {},
  onSaveTemplate = async () => {},
  onDuplicateTemplate = async () => {},
  onDeleteTemplate = async () => {},
  onNotify = () => {},
}) {
  const activeClasses = useMemo(
    () => classes.filter((course) => course.status === 'Aktif'),
    [classes],
  )
  const [selectedClassId, setSelectedClassId] = useState(() => activeClasses[0]?.id || '')
  const selectedClass = useMemo(
    () => activeClasses.find((course) => course.id === selectedClassId) || activeClasses[0],
    [activeClasses, selectedClassId],
  )
  const templatesForClass = useMemo(
    () => templates.filter((template) => template.classId === selectedClass?.id),
    [templates, selectedClass?.id],
  )
  const [selectedTemplateId, setSelectedTemplateId] = useState(() =>
    templates.find((template) => template.classId === activeClasses[0]?.id)?.id || '',
  )
  const [draft, setDraft] = useState(() =>
    getClassTemplateState(activeClasses, templates, activeClasses[0]?.id || '').draft,
  )
  const [selectedElementId, setSelectedElementId] = useState('')
  const [zoom, setZoom] = useState(0.58)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewCertificateId, setPreviewCertificateId] = useState('dummy')
  const [history, setHistory] = useState({ past: [], future: [] })
  const [showLeftSidebar, setShowLeftSidebar] = useState(false)
  const [showRightSidebar, setShowRightSidebar] = useState(false)
  const [isCreatingNewTemplate, setIsCreatingNewTemplate] = useState(false)
  const [editingElementId, setEditingElementId] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState('')

  const imageInputRef = useRef(null)
  const backgroundInputRef = useRef(null)
  const editSessionRef = useRef(false)
  const scrollContainerRef = useRef(null)
  const panRef = useRef(null)
  const pointersRef = useRef(new Map())
  const pinchRef = useRef(null)

  useEffect(() => {
    if (!isFullscreen || typeof document === 'undefined') {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isFullscreen])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleWheel = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        const zoomFactor = event.deltaY < 0 ? 1.08 : 0.92
        setZoom((currentZoom) => clampZoom(currentZoom * zoomFactor))
        return
      }

      if (event.shiftKey) {
        event.preventDefault()
        container.scrollLeft += event.deltaY
        return
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [])

  useEffect(() => {
    if (isCreatingNewTemplate || draft.id || selectedTemplateId || !selectedClass?.id) {
      return
    }

    const nextState = getClassTemplateState(activeClasses, templates, selectedClass.id)

    if (!nextState.templateId) {
      return
    }

    queueMicrotask(() => {
      setSelectedTemplateId(nextState.templateId)
      setDraft(nextState.draft)
      setSelectedElementId('')
      setEditingElementId('')
      setHistory({ past: [], future: [] })
      editSessionRef.current = false
    })
  }, [activeClasses, draft.id, isCreatingNewTemplate, selectedClass, selectedTemplateId, templates])

  const selectedElement = draft.elements.find((element) => element.id === selectedElementId) || null
  const previewCertificate = certificates.find((certificate) => certificate.id === previewCertificateId)
  const previewData = createCertificateData(
    previewCertificate || dummyCertificateForClass(selectedClass, settings),
    settings,
  )

  const layerElements = useMemo(
    () => [...draft.elements].sort((a, b) => (Number(b.zIndex) || 0) - (Number(a.zIndex) || 0)),
    [draft.elements],
  )

  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  const handleUndo = () => {
    const previousDraft = history.past.at(-1)

    if (!previousDraft) {
      return
    }

    setHistory((current) => ({
      past: current.past.slice(0, -1),
      future: [cloneDraft(draft), ...current.future].slice(0, historyLimit),
    }))
    setDraft(normalizeCertificateTemplate(previousDraft, selectedClass))
    setSelectedElementId('')
    endHistorySession()
  }

  const handleRedo = () => {
    const nextDraft = history.future[0]

    if (!nextDraft) {
      return
    }

    setHistory((current) => ({
      past: [...current.past.slice(-(historyLimit - 1)), cloneDraft(draft)],
      future: current.future.slice(1),
    }))
    setDraft(normalizeCertificateTemplate(nextDraft, selectedClass))
    setSelectedElementId('')
    endHistorySession()
  }

  const pushHistorySnapshot = () => {
    setHistory((current) => ({
      past: [...current.past.slice(-(historyLimit - 1)), cloneDraft(draft)],
      future: [],
    }))
  }

  const beginHistorySession = () => {
    if (editSessionRef.current) {
      return
    }

    pushHistorySnapshot()
    editSessionRef.current = true
  }

  const endHistorySession = () => {
    editSessionRef.current = false
  }

  const resetHistory = () => {
    setHistory({ past: [], future: [] })
    editSessionRef.current = false
  }

  const updateDraft = (updates, options = {}) => {
    if (options.track !== false) {
      pushHistorySnapshot()
    }

    setDraft((current) => normalizeCertificateTemplate({ ...current, ...updates }, selectedClass))
  }

  const updateElement = (elementId, updates, options = {}) => {
    if (options.track !== false) {
      pushHistorySnapshot()
    }

    setDraft((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId ? { ...element, ...updates } : element,
      ),
    }))
  }

  const addElement = (element) => {
    pushHistorySnapshot()
    setDraft((current) => {
      const zIndex = Math.max(0, ...current.elements.map((item) => Number(item.zIndex) || 0)) + 1
      const nextElement = { ...element, zIndex }

      setSelectedElementId(nextElement.id)
      return {
        ...current,
        elements: [...current.elements, nextElement],
      }
    })
  }

  const addPlaceholderElement = (placeholder) => {
    if (placeholder === '{{QR_CODE}}') {
      addElement(createQrElement({
        x: Math.max(40, Math.round(draft.width - 180)),
        y: Math.max(40, Math.round(draft.height - 210)),
        width: 130,
        height: 160,
      }))
      return
    }

    addElement(createTextElement({ content: placeholder }))
  }

  const handleUploadImage = async (file, mode = 'image') => {
    if (!file) {
      return
    }

    if (!file.type.startsWith('image/')) {
      onNotify('File harus gambar PNG, JPG, atau WebP.')
      return
    }

    try {
      const data = await uploadStorageFile({
        endpoint: uploadFileApiPath,
        file,
        type: 'certificate-image',
        sessionToken,
      })

      if (mode === 'background') {
        updateDraft({ backgroundImage: data.url })
      } else {
        addElement(createImageElement({
          src: data.url,
          alt: file.name,
          x: 120,
          y: 120,
        }))
      }

      onNotify('Gambar sertifikat berhasil diupload.')
    } catch (error) {
      onNotify(error.message || 'Gambar belum bisa diupload.')
    }
  }

  const handleSave = async () => {
    if (!selectedClass?.id) {
      onNotify('Pilih kelas dulu.')
      return
    }

    try {
      const data = await onSaveTemplate({
        ...draft,
        classId: selectedClass.id,
      })
      const savedTemplate = data.template || data.certificateTemplates?.find((template) =>
        template.id === draft.id || (template.classId === selectedClass.id && template.name === draft.name),
      )

      if (savedTemplate) {
        setSelectedTemplateId(savedTemplate.id)
        setDraft(normalizeCertificateTemplate(savedTemplate, selectedClass))
        setIsCreatingNewTemplate(false)
        resetHistory()
      }
      onNotify(data.message || 'Template sertifikat berhasil disimpan.')
    } catch (error) {
      onNotify(error.message || 'Template sertifikat belum bisa disimpan.')
    }
  }

  const handleDuplicate = async () => {
    if (!draft.id) {
      onNotify('Simpan template dulu sebelum duplicate.')
      return
    }

    try {
      const data = await onDuplicateTemplate({
        templateId: draft.id,
        classId: selectedClass.id,
        name: `${draft.name} Copy`,
      })
      const copiedTemplate = data.certificateTemplates?.find((template) =>
        template.classId === selectedClass.id && template.name === `${draft.name} Copy`,
      )

      if (copiedTemplate) {
        setSelectedTemplateId(copiedTemplate.id)
        setDraft(normalizeCertificateTemplate(copiedTemplate, selectedClass))
        setIsCreatingNewTemplate(false)
        resetHistory()
      }
      onNotify(data.message || 'Template berhasil diduplicate.')
    } catch (error) {
      onNotify(error.message || 'Template belum bisa diduplicate.')
    }
  }

  const handleDelete = async () => {
    if (!draft.id) {
      onNotify('Template bawaan belum tersimpan, tidak perlu dihapus.')
      return
    }

    try {
      const data = await onDeleteTemplate(draft.id)
      const nextState = getClassTemplateState(
        activeClasses,
        data.certificateTemplates || templates.filter((template) => template.id !== draft.id),
        selectedClass.id,
      )

      setSelectedTemplateId(nextState.templateId)
      setDraft(nextState.draft)
      setSelectedElementId('')
      setEditingElementId('')
      setIsCreatingNewTemplate(false)
      resetHistory()
      onNotify(data.message || 'Template dihapus.')
    } catch (error) {
      onNotify(error.message || 'Template belum bisa dihapus.')
    }
  }

  const setSizeType = (sizeType) => {
    const preset = certificateSizePresets[sizeType]

    updateDraft({
      sizeType,
      ...(preset ? { width: preset.width, height: preset.height } : {}),
    })
  }

  const changeLayer = (action) => {
    if (!selectedElement) {
      return
    }

    const indexes = draft.elements.map((element) => Number(element.zIndex) || 0)
    const min = Math.min(...indexes)
    const max = Math.max(...indexes)

    if (action === 'front') {
      updateElement(selectedElement.id, { zIndex: max + 1 })
    } else if (action === 'back') {
      updateElement(selectedElement.id, { zIndex: min - 1 })
    } else if (action === 'duplicate') {
      addElement({
        ...selectedElement,
        id: `${selectedElement.type}-${Date.now()}`,
        x: selectedElement.x + 24,
        y: selectedElement.y + 24,
      })
    } else if (action === 'delete') {
      pushHistorySnapshot()
      setDraft((current) => ({
        ...current,
        elements: current.elements.filter((element) => element.id !== selectedElement.id),
      }))
      setSelectedElementId('')
      setEditingElementId('')
    } else if (action === 'lock') {
      updateElement(selectedElement.id, { locked: !selectedElement.locked })
    } else if (action === 'hide') {
      updateElement(selectedElement.id, { hidden: !selectedElement.hidden })
    }
  }

  const alignSelected = (align) => {
    if (!selectedElement) {
      return
    }

    const updates = {}

    if (align === 'left') updates.x = 0
    if (align === 'center') updates.x = Math.round((draft.width - selectedElement.width) / 2)
    if (align === 'right') updates.x = Math.round(draft.width - selectedElement.width)
    if (align === 'top') updates.y = 0
    if (align === 'middle') updates.y = Math.round((draft.height - selectedElement.height) / 2)
    if (align === 'bottom') updates.y = Math.round(draft.height - selectedElement.height)

    updateElement(selectedElement.id, updates)
  }

  const distributeElements = (axis = 'horizontal') => {
    const visible = [...draft.elements].filter((element) => !element.hidden)

    if (visible.length < 3) {
      onNotify('Minimal 3 elemen untuk distribute spacing.')
      return
    }

    const sorted = visible.sort((a, b) => axis === 'horizontal' ? a.x - b.x : a.y - b.y)
    const first = sorted[0]
    const last = sorted.at(-1)
    const totalSize = sorted.reduce((sum, item) => sum + (axis === 'horizontal' ? item.width : item.height), 0)
    const range = axis === 'horizontal'
      ? last.x + last.width - first.x
      : last.y + last.height - first.y
    const gap = (range - totalSize) / Math.max(1, sorted.length - 1)
    let cursor = axis === 'horizontal' ? first.x : first.y

    const updatesById = {}
    sorted.forEach((element) => {
      updatesById[element.id] = axis === 'horizontal' ? { x: Math.round(cursor) } : { y: Math.round(cursor) }
      cursor += (axis === 'horizontal' ? element.width : element.height) + gap
    })

    setDraft((current) => ({
      ...current,
      elements: current.elements.map((element) => ({
        ...element,
        ...(updatesById[element.id] || {}),
      })),
    }))
  }

  const exportTemplate = async (format) => {
    const fileName = cleanFileName(`${selectedClass?.title || 'sertifikat'}-${draft.name}`)

    try {
      if (format === 'pdf') {
        await downloadCertificateTemplatePdf(draft, previewData, fileName)
      } else {
        await downloadCertificateTemplateImage(draft, previewData, format, fileName)
      }
    } catch {
      onNotify('Export gagal. Pastikan gambar eksternal bisa diakses browser.')
    }
  }

  const handleCanvasPanStart = (event) => {
    const container = scrollContainerRef.current

    if (!container || event.target.closest('.template-element, button, input, textarea, select')) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (pointersRef.current.size === 2) {
      const points = Array.from(pointersRef.current.values())
      pinchRef.current = {
        distance: pointerDistance(points[0], points[1]),
        zoom,
      }
      panRef.current = null
      return
    }

    panRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    }
  }

  const handleCanvasPanMove = (event) => {
    const container = scrollContainerRef.current

    if (!container || !pointersRef.current.has(event.pointerId)) {
      return
    }

    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (pointersRef.current.size >= 2 && pinchRef.current) {
      const points = Array.from(pointersRef.current.values()).slice(0, 2)
      const nextDistance = pointerDistance(points[0], points[1])
      const ratio = nextDistance / Math.max(1, pinchRef.current.distance)

      setZoom(clampZoom(pinchRef.current.zoom * ratio))
      return
    }

    if (!panRef.current || panRef.current.pointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    container.scrollLeft = panRef.current.scrollLeft - (event.clientX - panRef.current.x)
    container.scrollTop = panRef.current.scrollTop - (event.clientY - panRef.current.y)
  }

  const handleCanvasPanEnd = (event) => {
    pointersRef.current.delete(event.pointerId)
    event.currentTarget.releasePointerCapture?.(event.pointerId)

    if (pointersRef.current.size < 2) {
      pinchRef.current = null
    }

    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null
    }
  }

  const renderQuickTools = () => (
    <div className="certificate-tool-grid">
      <button type="button" onClick={() => addElement(createTextElement({ content: '{{NAMA_PESERTA}}', nameField: true, autoResize: true }))}>
        <Icon name="user" />
        <span>Nama peserta</span>
      </button>
      <button type="button" onClick={() => addElement(createTextElement({ content: 'Teks baru' }))}>
        <Icon name="text" />
        <span>Teks</span>
      </button>
      <button type="button" onClick={() => imageInputRef.current?.click()}>
        <Icon name="image" />
        <span>Gambar</span>
      </button>
      <button type="button" onClick={() => backgroundInputRef.current?.click()}>
        <Icon name="upload" />
        <span>Background</span>
      </button>
      <button type="button" onClick={() => addElement(createShapeElement('rectangle'))}>
        <Icon name="square" />
        <span>Rectangle</span>
      </button>
      <button type="button" onClick={() => addElement(createShapeElement('circle'))}>
        <Icon name="circleShape" />
        <span>Circle</span>
      </button>
      <button type="button" onClick={() => addElement(createShapeElement('line'))}>
        <Icon name="minus" />
        <span>Line</span>
      </button>
      <button type="button" onClick={() => addElement(createQrElement())}>
        <Icon name="qrCode" />
        <span>QR Code</span>
      </button>
    </div>
  )

  const renderPlaceholderControls = () => (
    <>
      <h4>Placeholder</h4>
      <div className="placeholder-chip-list">
        {certificatePlaceholders.map((placeholder) => (
          <button
            type="button"
            key={placeholder}
            onClick={() => {
              addPlaceholderElement(placeholder)
              setMobilePanel('')
            }}
          >
            {placeholder}
          </button>
        ))}
      </div>
    </>
  )

  const renderLayerControls = () => (
    <>
      <h4>Layers</h4>
      <div className="template-layer-list">
        {layerElements.map((element) => (
          <button
            type="button"
            className={selectedElementId === element.id ? 'active' : ''}
            key={element.id}
            onClick={() => {
              setSelectedElementId(element.id)
              setMobilePanel('')
            }}
          >
            <span>{element.type}</span>
            <small>{element.content || element.shape || element.alt || element.id}</small>
          </button>
        ))}
      </div>
    </>
  )

  const renderDocumentControls = () => (
    <>
      <h4>Document</h4>
      <label>
        Nama template
        <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
      </label>
      <label>
        Ukuran
        <select value={draft.sizeType} onChange={(event) => setSizeType(event.target.value)}>
          <option value="a4Landscape">A4 Landscape</option>
          <option value="a4Portrait">A4 Portrait</option>
          <option value="custom">Custom Size</option>
        </select>
      </label>
      <div className="two-column-fields">
        <label>
          Width
          <input
            type="number"
            value={draft.width}
            disabled={draft.sizeType !== 'custom'}
            onChange={(event) => updateDraft({ width: Number(event.target.value) })}
          />
        </label>
        <label>
          Height
          <input
            type="number"
            value={draft.height}
            disabled={draft.sizeType !== 'custom'}
            onChange={(event) => updateDraft({ height: Number(event.target.value) })}
          />
        </label>
      </div>
      <div className="two-column-fields">
        <label>
          Background
          <input type="color" value={draft.backgroundColor} onChange={(event) => updateDraft({ backgroundColor: event.target.value })} />
        </label>
        <label>
          Grid
          <input type="number" value={draft.gridSize} onChange={(event) => updateDraft({ gridSize: Number(event.target.value) })} />
        </label>
      </div>
      <label className="inline-setting">
        <input type="checkbox" checked={draft.snapToGrid} onChange={(event) => updateDraft({ snapToGrid: event.target.checked })} />
        Snap grid saat tekan Shift
      </label>

      <div className="template-secondary-actions">
        <button type="button" onClick={handleDuplicate}>Duplicate Template</button>
        <button type="button" onClick={handleDelete}>Delete Template</button>
      </div>
    </>
  )

  const renderPropertiesControls = () => (
    <>
      <h4>Properties</h4>
      {!selectedElement && <p className="editor-muted">Pilih elemen di canvas untuk mengedit properties.</p>}
      {selectedElement && (
        <div className="properties-form">
          <div className="two-column-fields">
            <label>X<input type="number" value={Math.round(selectedElement.x)} onChange={(event) => updateElement(selectedElement.id, { x: Number(event.target.value) })} /></label>
            <label>Y<input type="number" value={Math.round(selectedElement.y)} onChange={(event) => updateElement(selectedElement.id, { y: Number(event.target.value) })} /></label>
            <label>W<input type="number" value={Math.round(selectedElement.width)} onChange={(event) => updateElement(selectedElement.id, { width: Number(event.target.value) })} /></label>
            <label>H<input type="number" value={Math.round(selectedElement.height)} onChange={(event) => updateElement(selectedElement.id, { height: Number(event.target.value) })} /></label>
          </div>
          <label>
            Rotate
            <input type="range" min="-180" max="180" value={selectedElement.rotation || 0} onChange={(event) => updateElement(selectedElement.id, { rotation: Number(event.target.value) })} />
          </label>
          <label>
            Opacity
            <input type="range" min="0" max="1" step="0.05" value={selectedElement.opacity ?? 1} onChange={(event) => updateElement(selectedElement.id, { opacity: Number(event.target.value) })} />
          </label>

          {selectedElement.type === 'text' && (
            <>
              <label>
                Teks
                <textarea value={selectedElement.content || ''} rows="4" onChange={(event) => updateElement(selectedElement.id, { content: event.target.value })}></textarea>
              </label>
              <label>
                Font
                <select value={selectedElement.fontFamily || 'Inter'} onChange={(event) => updateElement(selectedElement.id, { fontFamily: event.target.value })}>
                  {fontOptions.map((font) => <option value={font} key={font}>{font}</option>)}
                </select>
              </label>
              <div className="two-column-fields">
                <label>Size<input type="number" value={selectedElement.fontSize || 24} onChange={(event) => updateElement(selectedElement.id, { fontSize: Number(event.target.value) })} /></label>
                <label>Color<input type="color" value={selectedElement.color || '#111827'} onChange={(event) => updateElement(selectedElement.id, { color: event.target.value })} /></label>
                <label>Letter<input type="number" value={selectedElement.letterSpacing || 0} onChange={(event) => updateElement(selectedElement.id, { letterSpacing: Number(event.target.value) })} /></label>
                <label>Line<input type="number" step="0.1" value={selectedElement.lineHeight || 1.2} onChange={(event) => updateElement(selectedElement.id, { lineHeight: Number(event.target.value) })} /></label>
              </div>
              <div className="format-button-grid">
                <button type="button" className={selectedElement.fontWeight === 'bold' ? 'active' : ''} onClick={() => updateElement(selectedElement.id, { fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold' })}>B</button>
                <button type="button" className={selectedElement.fontStyle === 'italic' ? 'active' : ''} onClick={() => updateElement(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })}>I</button>
                <button type="button" className={selectedElement.underline ? 'active' : ''} onClick={() => updateElement(selectedElement.id, { underline: !selectedElement.underline })}>U</button>
                <button type="button" className={selectedElement.align === 'left' ? 'active' : ''} onClick={() => updateElement(selectedElement.id, { align: 'left' })}>L</button>
                <button type="button" className={selectedElement.align === 'center' ? 'active' : ''} onClick={() => updateElement(selectedElement.id, { align: 'center' })}>C</button>
                <button type="button" className={selectedElement.align === 'right' ? 'active' : ''} onClick={() => updateElement(selectedElement.id, { align: 'right' })}>R</button>
              </div>
              <label className="inline-setting"><input type="checkbox" checked={selectedElement.shadow === true} onChange={(event) => updateElement(selectedElement.id, { shadow: event.target.checked })} /> Text shadow</label>
              <label className="inline-setting"><input type="checkbox" checked={selectedElement.gradient === true} onChange={(event) => updateElement(selectedElement.id, { gradient: event.target.checked })} /> Gradient text</label>
              <label className="inline-setting"><input type="checkbox" checked={selectedElement.autoResize === true} onChange={(event) => updateElement(selectedElement.id, { autoResize: event.target.checked })} /> Auto resize nama</label>
              <div className="two-column-fields">
                <label>Min<input type="number" value={selectedElement.minFontSize || 14} onChange={(event) => updateElement(selectedElement.id, { minFontSize: Number(event.target.value) })} /></label>
                <label>Max<input type="number" value={selectedElement.maxFontSize || 56} onChange={(event) => updateElement(selectedElement.id, { maxFontSize: Number(event.target.value) })} /></label>
              </div>
            </>
          )}

          {selectedElement.type === 'image' && (
            <>
              <label>
                Image URL
                <input value={selectedElement.src || ''} onChange={(event) => updateElement(selectedElement.id, { src: event.target.value })} />
              </label>
              <label>
                Crop
                <select value={selectedElement.objectFit || 'contain'} onChange={(event) => updateElement(selectedElement.id, { objectFit: event.target.value })}>
                  <option value="contain">Contain</option>
                  <option value="cover">Cover / Crop</option>
                </select>
              </label>
            </>
          )}

          {selectedElement.type === 'shape' && (
            <>
              <label>
                Shape
                <select value={selectedElement.shape || 'rectangle'} onChange={(event) => updateElement(selectedElement.id, { shape: event.target.value })}>
                  <option value="rectangle">Rectangle</option>
                  <option value="circle">Circle</option>
                  <option value="line">Line</option>
                </select>
              </label>
              <div className="two-column-fields">
                <label>Fill<input type="color" value={selectedElement.fill || '#f8fafc'} onChange={(event) => updateElement(selectedElement.id, { fill: event.target.value })} /></label>
                <label>Stroke<input type="color" value={selectedElement.stroke || '#d4af37'} onChange={(event) => updateElement(selectedElement.id, { stroke: event.target.value })} /></label>
                <label>Stroke W<input type="number" value={selectedElement.strokeWidth || 0} onChange={(event) => updateElement(selectedElement.id, { strokeWidth: Number(event.target.value) })} /></label>
                <label>Radius<input type="number" value={selectedElement.borderRadius || 0} onChange={(event) => updateElement(selectedElement.id, { borderRadius: Number(event.target.value) })} /></label>
              </div>
            </>
          )}

          {selectedElement.type === 'qr' && (
            <div className="two-column-fields">
              <label>QR Color<input type="color" value={selectedElement.color || '#111827'} onChange={(event) => updateElement(selectedElement.id, { color: event.target.value })} /></label>
              <label>QR BG<input type="color" value={selectedElement.background || '#ffffff'} onChange={(event) => updateElement(selectedElement.id, { background: event.target.value })} /></label>
            </div>
          )}
        </div>
      )}
    </>
  )

  const mobilePanelTitle = {
    tools: 'Tools',
    placeholder: 'Placeholder',
    document: 'Dokumen',
    properties: 'Properti',
    layers: 'Layer',
  }[mobilePanel]

  const renderMobilePanelContent = () => {
    if (mobilePanel === 'tools') return renderQuickTools()
    if (mobilePanel === 'placeholder') return renderPlaceholderControls()
    if (mobilePanel === 'document') return renderDocumentControls()
    if (mobilePanel === 'properties') return renderPropertiesControls()
    if (mobilePanel === 'layers') return renderLayerControls()
    return null
  }

  return (
    <section className={`certificate-editor-panel ${isFullscreen ? 'is-fullscreen' : ''}`.trim()}>
      <div className="certificate-editor-topbar">
        <div>
          <p className="eyebrow">Visual Editor</p>
          <h3>Kelola Template Sertifikat</h3>
        </div>
        <div className="certificate-editor-actions">
          <button className="btn btn-secondary" type="button" onClick={() => setIsFullscreen((value) => !value)}>
            <Icon name={isFullscreen ? 'minimize' : 'maximize'} />
            {isFullscreen ? 'Keluar' : 'Fullscreen'}
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => setIsPreviewOpen(true)}>
            <Icon name="eye" />
            Preview
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => exportTemplate('png')}>
            PNG
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => exportTemplate('jpg')}>
            JPG
          </button>
          <button className="btn btn-secondary" type="button" onClick={() => exportTemplate('pdf')}>
            PDF
          </button>
          <button className="btn btn-primary" type="button" onClick={handleSave}>
            <Icon name="checkCircle" />
            Save
          </button>
        </div>
      </div>

      <div className="certificate-template-config">
        <label>
          Kelas
          <select
            value={selectedClass?.id || ''}
            onChange={(event) => {
              const nextState = getClassTemplateState(activeClasses, templates, event.target.value)

              setSelectedClassId(nextState.classId)
              setSelectedTemplateId(nextState.templateId)
              setDraft(nextState.draft)
              setSelectedElementId('')
              setEditingElementId('')
              setIsCreatingNewTemplate(false)
              resetHistory()
            }}
          >
            {activeClasses.map((course) => (
              <option value={course.id} key={course.id}>{course.title}</option>
            ))}
          </select>
        </label>
        <label>
          Template
          <select
            value={selectedTemplateId}
            onChange={(event) => {
              const nextState = getClassTemplateState(activeClasses, templates, selectedClass?.id, event.target.value)

              setSelectedClassId(nextState.classId)
              setSelectedTemplateId(nextState.templateId)
              setDraft(nextState.draft)
              setSelectedElementId('')
              setEditingElementId('')
              setIsCreatingNewTemplate(event.target.value === '')
              resetHistory()
            }}
          >
            <option value="">Template baru otomatis</option>
            {templatesForClass.map((template) => (
              <option value={template.id} key={template.id}>{template.name}</option>
            ))}
          </select>
        </label>
        <label>
          Preview data
          <select value={previewCertificateId} onChange={(event) => setPreviewCertificateId(event.target.value)}>
            <option value="dummy">Data dummy</option>
            {certificates
              .filter((certificate) => certificate.classId === selectedClass?.id)
              .map((certificate) => (
                <option value={certificate.id} key={certificate.id}>
                  {certificate.participantName} - {certificate.certificateId}
                </option>
              ))}
          </select>
        </label>
      </div>

      <div className="certificate-editor-commandbar" aria-label="Toolbar editor sertifikat">
        <div className="certificate-toolbar-group">
          <span>Tools</span>
          <ToolbarIconButton
            icon="user"
            label="Tambah area nama peserta"
            onClick={() => addElement(createTextElement({ content: '{{NAMA_PESERTA}}', nameField: true, autoResize: true }))}
          />
          <ToolbarIconButton
            icon="text"
            label="Tambah teks"
            onClick={() => addElement(createTextElement({ content: 'Teks baru' }))}
          />
          <ToolbarIconButton icon="image" label="Upload gambar" onClick={() => imageInputRef.current?.click()} />
          <ToolbarIconButton icon="upload" label="Upload background" onClick={() => backgroundInputRef.current?.click()} />
          <ToolbarIconButton icon="square" label="Tambah rectangle" onClick={() => addElement(createShapeElement('rectangle'))} />
          <ToolbarIconButton icon="circleShape" label="Tambah circle" onClick={() => addElement(createShapeElement('circle'))} />
          <ToolbarIconButton icon="minus" label="Tambah line" onClick={() => addElement(createShapeElement('line'))} />
          <ToolbarIconButton icon="qrCode" label="Tambah QR Code" onClick={() => addElement(createQrElement())} />
        </div>

        <div className="certificate-toolbar-group">
          <span>History</span>
          <ToolbarIconButton icon="undo" label="Undo" disabled={!canUndo} onClick={handleUndo} />
          <ToolbarIconButton icon="redo" label="Redo" disabled={!canRedo} onClick={handleRedo} />
        </div>

        <div className="certificate-toolbar-group">
          <span>Zoom</span>
          <ToolbarIconButton icon="zoomOut" label="Zoom out" onClick={() => setZoom((value) => clampZoom(value - 0.08))} />
          <strong>{Math.round(zoom * 100)}%</strong>
          <ToolbarIconButton icon="zoomIn" label="Zoom in" onClick={() => setZoom((value) => clampZoom(value + 0.08))} />
        </div>

        <div className="certificate-toolbar-group">
          <span>Tampilan</span>
          <button
            type="button"
            className={`certificate-icon-tool ${showLeftSidebar ? 'active' : ''}`}
            title={showLeftSidebar ? 'Sembunyikan Panel Kiri' : 'Tampilkan Panel Kiri'}
            onClick={() => setShowLeftSidebar(!showLeftSidebar)}
          >
            <Icon name={showLeftSidebar ? 'eye' : 'eyeOff'} />
          </button>
          <button
            type="button"
            className={`certificate-icon-tool ${showRightSidebar ? 'active' : ''}`}
            title={showRightSidebar ? 'Sembunyikan Panel Kanan' : 'Tampilkan Panel Kanan'}
            onClick={() => setShowRightSidebar(!showRightSidebar)}
          >
            <Icon name={showRightSidebar ? 'fileText' : 'eyeOff'} />
          </button>
          <button
            type="button"
            className={`certificate-icon-tool ${isFullscreen ? 'active' : ''}`}
            title={isFullscreen ? 'Keluar fullscreen' : 'Fullscreen editor'}
            onClick={() => setIsFullscreen((value) => !value)}
          >
            <Icon name={isFullscreen ? 'minimize' : 'maximize'} />
          </button>
        </div>

        <div className="certificate-toolbar-group">
          <span>Align</span>
          <ToolbarIconButton icon="alignLeft" label="Align left" disabled={!selectedElement} onClick={() => alignSelected('left')} />
          <ToolbarIconButton icon="alignCenter" label="Align center" disabled={!selectedElement} onClick={() => alignSelected('center')} />
          <ToolbarIconButton icon="alignRight" label="Align right" disabled={!selectedElement} onClick={() => alignSelected('right')} />
          <ToolbarIconButton icon="alignTop" label="Align top" disabled={!selectedElement} onClick={() => alignSelected('top')} />
          <ToolbarIconButton icon="alignMiddle" label="Align middle" disabled={!selectedElement} onClick={() => alignSelected('middle')} />
          <ToolbarIconButton icon="alignBottom" label="Align bottom" disabled={!selectedElement} onClick={() => alignSelected('bottom')} />
          <ToolbarIconButton icon="distributeHorizontal" label="Distribute horizontal" onClick={() => distributeElements('horizontal')} />
          <ToolbarIconButton icon="distributeVertical" label="Distribute vertical" onClick={() => distributeElements('vertical')} />
        </div>

        <div className="certificate-toolbar-group">
          <span>Layer</span>
          <ToolbarIconButton icon="layers" label="Bring to front" disabled={!selectedElement} onClick={() => changeLayer('front')} />
          <ToolbarIconButton icon="layers" label="Send to back" disabled={!selectedElement} onClick={() => changeLayer('back')} />
          <ToolbarIconButton icon="copy" label="Duplicate layer" disabled={!selectedElement} onClick={() => changeLayer('duplicate')} />
          <ToolbarIconButton
            icon={selectedElement?.locked ? 'lockOpen' : 'lock'}
            label={selectedElement?.locked ? 'Unlock layer' : 'Lock layer'}
            disabled={!selectedElement}
            onClick={() => changeLayer('lock')}
          />
          <ToolbarIconButton
            icon={selectedElement?.hidden ? 'eye' : 'eyeOff'}
            label={selectedElement?.hidden ? 'Show layer' : 'Hide layer'}
            disabled={!selectedElement}
            onClick={() => changeLayer('hide')}
          />
          <ToolbarIconButton icon="trash" label="Delete layer" disabled={!selectedElement} onClick={() => changeLayer('delete')} />
        </div>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="certificate-hidden-input"
        onChange={(event) => {
          handleUploadImage(event.target.files?.[0], 'image')
          event.target.value = ''
        }}
      />
      <input
        ref={backgroundInputRef}
        type="file"
        accept="image/*"
        className="certificate-hidden-input"
        onChange={(event) => {
          handleUploadImage(event.target.files?.[0], 'background')
          event.target.value = ''
        }}
      />

      <div 
        className="certificate-editor-layout"
        style={{
          gridTemplateColumns: [
            showLeftSidebar ? 'minmax(176px, 230px)' : '',
            'minmax(320px, 1fr)',
            showRightSidebar ? 'minmax(270px, 330px)' : ''
          ].filter(Boolean).join(' ')
        }}
      >
        {showLeftSidebar && (
          <aside className="certificate-editor-sidebar tools-sidebar">
            {renderPlaceholderControls()}
            {renderLayerControls()}
          </aside>
        )}

        <div className="certificate-editor-canvas-wrap">
          <div
            ref={scrollContainerRef}
            className="certificate-editor-scroll"
            onPointerDown={handleCanvasPanStart}
            onPointerMove={handleCanvasPanMove}
            onPointerUp={handleCanvasPanEnd}
            onPointerCancel={handleCanvasPanEnd}
          >
            <CertificateTemplateCanvas
              template={draft}
              data={previewData}
              zoom={zoom}
              editable
              selectedElementId={selectedElementId}
              editingElementId={editingElementId}
              onSelect={setSelectedElementId}
              onStartTextEdit={setEditingElementId}
              onEndTextEdit={() => setEditingElementId('')}
              onElementChange={updateElement}
              onEditStart={beginHistorySession}
              onEditEnd={endHistorySession}
            />
          </div>
        </div>

        {showRightSidebar && (
          <aside className="certificate-editor-sidebar properties-sidebar">
            {renderDocumentControls()}
            {renderPropertiesControls()}
          </aside>
        )}
      </div>

      <nav className="certificate-mobile-dock" aria-label="Panel cepat editor sertifikat">
        <button type="button" className={mobilePanel === 'tools' ? 'active' : ''} onClick={() => setMobilePanel(mobilePanel === 'tools' ? '' : 'tools')}>
          <Icon name="plus" />
          <span>Tools</span>
        </button>
        <button type="button" className={mobilePanel === 'placeholder' ? 'active' : ''} onClick={() => setMobilePanel(mobilePanel === 'placeholder' ? '' : 'placeholder')}>
          <Icon name="text" />
          <span>Placeholder</span>
        </button>
        <button type="button" className={mobilePanel === 'document' ? 'active' : ''} onClick={() => setMobilePanel(mobilePanel === 'document' ? '' : 'document')}>
          <Icon name="fileText" />
          <span>Dokumen</span>
        </button>
        <button type="button" className={mobilePanel === 'properties' ? 'active' : ''} onClick={() => setMobilePanel(mobilePanel === 'properties' ? '' : 'properties')}>
          <Icon name="settings" />
          <span>Properti</span>
        </button>
        <button type="button" className={mobilePanel === 'layers' ? 'active' : ''} onClick={() => setMobilePanel(mobilePanel === 'layers' ? '' : 'layers')}>
          <Icon name="layers" />
          <span>Layer</span>
        </button>
      </nav>

      {mobilePanel && (
        <div className="certificate-mobile-sheet" role="dialog" aria-modal="false" aria-label={mobilePanelTitle}>
          <div className="certificate-mobile-sheet-card">
            <div className="certificate-mobile-sheet-heading">
              <strong>{mobilePanelTitle}</strong>
              <button type="button" onClick={() => setMobilePanel('')} aria-label="Tutup panel">
                <Icon name="x" />
              </button>
            </div>
            <div className="certificate-mobile-sheet-body">
              {renderMobilePanelContent()}
            </div>
          </div>
        </div>
      )}

      {isPreviewOpen && (
        <div className="certificate-preview-modal" role="dialog" aria-modal="true">
          <div className="certificate-preview-modal-card">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Fullscreen Preview</p>
                <h2>{draft.name}</h2>
              </div>
              <button type="button" onClick={() => setIsPreviewOpen(false)} aria-label="Tutup preview">
                <Icon name="x" />
              </button>
            </div>
            <div className="certificate-preview-modal-body">
              <CertificateTemplateCanvas template={draft} data={previewData} zoom={Math.min(0.82, 900 / draft.width)} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default CertificateTemplateEditor
