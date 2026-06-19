import { useMemo, useRef, useState } from 'react'
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
  const imageInputRef = useRef(null)
  const backgroundInputRef = useRef(null)

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

  const updateDraft = (updates) => {
    setDraft((current) => normalizeCertificateTemplate({ ...current, ...updates }, selectedClass))
  }

  const updateElement = (elementId, updates) => {
    setDraft((current) => ({
      ...current,
      elements: current.elements.map((element) =>
        element.id === elementId ? { ...element, ...updates } : element,
      ),
    }))
  }

  const addElement = (element) => {
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
      const savedTemplate = data.certificateTemplates?.find((template) =>
        template.classId === selectedClass.id && template.name === draft.name,
      )

      if (savedTemplate) {
        setSelectedTemplateId(savedTemplate.id)
        setDraft(normalizeCertificateTemplate(savedTemplate, selectedClass))
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
      setDraft((current) => ({
        ...current,
        elements: current.elements.filter((element) => element.id !== selectedElement.id),
      }))
      setSelectedElementId('')
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

  return (
    <section className="certificate-editor-panel">
      <div className="certificate-editor-topbar">
        <div>
          <p className="eyebrow">Visual Editor</p>
          <h3>Kelola Template Sertifikat</h3>
        </div>
        <div className="certificate-editor-actions">
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

      <div className="certificate-editor-layout">
        <aside className="certificate-editor-sidebar tools-sidebar">
          <h4>Tools</h4>
          <button type="button" onClick={() => addElement(createTextElement({ content: '{{NAMA_PESERTA}}', nameField: true, autoResize: true }))}>
            <Icon name="user" />
            Nama Peserta
          </button>
          <button type="button" onClick={() => addElement(createTextElement({ content: 'Teks baru' }))}>
            <Icon name="fileText" />
            Tambah Teks
          </button>
          <button type="button" onClick={() => imageInputRef.current?.click()}>
            <Icon name="image" />
            Upload Gambar
          </button>
          <button type="button" onClick={() => addElement(createShapeElement('rectangle'))}>
            <Icon name="layoutDashboard" />
            Rectangle
          </button>
          <button type="button" onClick={() => addElement(createShapeElement('circle'))}>
            <Icon name="target" />
            Circle
          </button>
          <button type="button" onClick={() => addElement(createShapeElement('line'))}>
            <Icon name="filter" />
            Line
          </button>
          <button type="button" onClick={() => addElement(createQrElement())}>
            <Icon name="shield" />
            QR Code
          </button>
          <button type="button" onClick={() => backgroundInputRef.current?.click()}>
            <Icon name="upload" />
            Background
          </button>

          <h4>Placeholder</h4>
          <div className="placeholder-chip-list">
            {certificatePlaceholders.map((placeholder) => (
              <button
                type="button"
                key={placeholder}
                onClick={() => addElement(createTextElement({ content: placeholder }))}
              >
                {placeholder}
              </button>
            ))}
          </div>

          <h4>Layer</h4>
          <div className="layer-actions">
            <button type="button" onClick={() => changeLayer('front')}>Front</button>
            <button type="button" onClick={() => changeLayer('back')}>Back</button>
            <button type="button" onClick={() => changeLayer('duplicate')}>Duplicate</button>
            <button type="button" onClick={() => changeLayer('lock')}>{selectedElement?.locked ? 'Unlock' : 'Lock'}</button>
            <button type="button" onClick={() => changeLayer('hide')}>{selectedElement?.hidden ? 'Show' : 'Hide'}</button>
            <button type="button" onClick={() => changeLayer('delete')}>Delete</button>
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              handleUploadImage(event.target.files?.[0], 'image')
              event.target.value = ''
            }}
          />
          <input
            ref={backgroundInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              handleUploadImage(event.target.files?.[0], 'background')
              event.target.value = ''
            }}
          />
        </aside>

        <div className="certificate-editor-canvas-wrap">
          <div className="certificate-editor-toolbar">
            <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.08))}>-</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.2, value + 0.08))}>+</button>
            <button type="button" onClick={() => alignSelected('left')}>Left</button>
            <button type="button" onClick={() => alignSelected('center')}>Center</button>
            <button type="button" onClick={() => alignSelected('right')}>Right</button>
            <button type="button" onClick={() => alignSelected('top')}>Top</button>
            <button type="button" onClick={() => alignSelected('middle')}>Middle</button>
            <button type="button" onClick={() => alignSelected('bottom')}>Bottom</button>
            <button type="button" onClick={() => distributeElements('horizontal')}>Distribute X</button>
            <button type="button" onClick={() => distributeElements('vertical')}>Distribute Y</button>
          </div>
          <div className="certificate-editor-scroll">
            <CertificateTemplateCanvas
              template={draft}
              data={previewData}
              zoom={zoom}
              editable
              selectedElementId={selectedElementId}
              onSelect={setSelectedElementId}
              onElementChange={updateElement}
            />
          </div>
        </div>

        <aside className="certificate-editor-sidebar properties-sidebar">
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
            Snap to grid
          </label>

          <div className="template-secondary-actions">
            <button type="button" onClick={handleDuplicate}>Duplicate Template</button>
            <button type="button" onClick={handleDelete}>Delete Template</button>
          </div>

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

          <h4>Layers</h4>
          <div className="template-layer-list">
            {layerElements.map((element) => (
              <button
                type="button"
                className={selectedElementId === element.id ? 'active' : ''}
                key={element.id}
                onClick={() => setSelectedElementId(element.id)}
              >
                <span>{element.type}</span>
                <small>{element.content || element.shape || element.alt || element.id}</small>
              </button>
            ))}
          </div>
        </aside>
      </div>

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
