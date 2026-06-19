import { useMemo, useRef, useState } from 'react'
import {
  normalizeCertificateTemplate,
  replaceCertificatePlaceholders,
} from '../lib/certificateTemplate'
import Icon from './Icon'

function qrBits(value) {
  let hash = 2166136261

  for (const character of String(value || 'CERTIFICATE')) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return Math.abs(hash >>> 0).toString(2).padStart(32, '0').repeat(12)
}

function QrPreview({ element, data }) {
  const value = data.verificationUrl || data.ID_SERTIFIKAT || 'CERTIFICATE'
  const bits = qrBits(value)

  return (
    <div
      className="template-qr-preview"
      style={{
        background: element.background || '#ffffff',
        color: element.color || '#111827',
      }}
    >
      {Array.from({ length: 81 }).map((_, index) => {
        const row = Math.floor(index / 9)
        const col = index % 9
        const finder =
          (row < 3 && col < 3) ||
          (row < 3 && col > 5) ||
          (row > 5 && col < 3)
        const active = finder || bits[index] === '1'

        return <i className={active ? 'active' : ''} key={index}></i>
      })}
    </div>
  )
}

function textElementStyle(element) {
  const baseStyle = {
    fontFamily: element.fontFamily || 'Arial',
    fontSize: `${element.fontSize || 24}px`,
    fontWeight: element.fontWeight === 'bold' ? 800 : 400,
    fontStyle: element.fontStyle === 'italic' ? 'italic' : 'normal',
    textDecoration: element.underline ? 'underline' : 'none',
    color: element.color || '#111827',
    textAlign: element.align || 'left',
    letterSpacing: `${Number(element.letterSpacing) || 0}px`,
    lineHeight: Number(element.lineHeight) || 1.2,
    textShadow: element.shadow ? '0 4px 12px rgba(15, 23, 42, 0.28)' : 'none',
  }

  if (!element.gradient) {
    return baseStyle
  }

  return {
    ...baseStyle,
    color: 'transparent',
    backgroundImage: `linear-gradient(90deg, ${element.gradientFrom || '#2563eb'}, ${element.gradientTo || '#d97706'})`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
  }
}

function editableTextElementStyle(element) {
  return {
    ...textElementStyle({ ...element, gradient: false }),
    color: element.color || '#111827',
  }
}

function ShapePreview({ element }) {
  if (element.shape === 'line') {
    return (
      <div
        className="template-shape-line"
        style={{
          background: element.fill || element.stroke || '#111827',
          height: `${Math.max(1, Number(element.height) || 2)}px`,
        }}
      />
    )
  }

  return (
    <div
      className={`template-shape-preview shape-${element.shape || 'rectangle'}`}
      style={{
        background: element.fill || 'transparent',
        border: `${Math.max(0, Number(element.strokeWidth) || 0)}px solid ${element.stroke || 'transparent'}`,
        borderRadius: element.shape === 'circle' ? '999px' : `${Number(element.borderRadius) || 0}px`,
      }}
    />
  )
}

function ElementPreview({
  element,
  data,
  editable = false,
  isSelected = false,
  onTextFocus = () => {},
  onTextBlur = () => {},
  onTextChange = () => {},
}) {
  if (element.type === 'text') {
    if (editable && isSelected && !element.locked) {
      return (
        <textarea
          className="template-text-preview template-text-editor"
          value={element.content || ''}
          style={editableTextElementStyle(element)}
          spellCheck="false"
          onFocus={onTextFocus}
          onBlur={onTextBlur}
          onChange={(event) => onTextChange(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        />
      )
    }

    return (
      <div className="template-text-preview" style={textElementStyle(element)}>
        {replaceCertificatePlaceholders(element.content, data)}
      </div>
    )
  }

  if (element.type === 'image') {
    return element.src ? (
      <img
        className="template-image-preview"
        src={element.src}
        alt={element.alt || ''}
        draggable="false"
        style={{ objectFit: element.objectFit || 'contain' }}
      />
    ) : (
      <div className="template-empty-image">
        <Icon name="image" />
      </div>
    )
  }

  if (element.type === 'qr') {
    return <QrPreview element={element} data={data} />
  }

  return <ShapePreview element={element} />
}

function CertificateTemplateCanvas({
  template,
  data = {},
  zoom = 1,
  editable = false,
  selectedElementId = '',
  onSelect = () => {},
  onElementChange = () => {},
  onEditStart = () => {},
  onEditEnd = () => {},
}) {
  const safeTemplate = useMemo(() => normalizeCertificateTemplate(template), [template])
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const applySnap = (value) => {
    if (!safeTemplate.snapToGrid) {
      return value
    }

    const grid = Math.max(1, Number(safeTemplate.gridSize) || 10)
    return Math.round(value / grid) * grid
  }

  const startPointerAction = (event, element, mode = 'move') => {
    if (!editable || element.locked) {
      onSelect(element.id)
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onEditStart()
    onSelect(element.id)
    dragRef.current = {
      id: element.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: Number(element.x) || 0,
      startTop: Number(element.y) || 0,
      startWidth: Number(element.width) || 80,
      startHeight: Number(element.height) || 80,
    }
    setIsDragging(true)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopPointerAction)
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current

    if (!drag) {
      return
    }

    const deltaX = (event.clientX - drag.startX) / zoom
    const deltaY = (event.clientY - drag.startY) / zoom

    if (drag.mode === 'resize') {
      onElementChange(drag.id, {
        width: Math.max(20, applySnap(drag.startWidth + deltaX)),
        height: Math.max(20, applySnap(drag.startHeight + deltaY)),
      }, { track: false })
      return
    }

    onElementChange(drag.id, {
      x: applySnap(drag.startLeft + deltaX),
      y: applySnap(drag.startTop + deltaY),
    }, { track: false })
  }

  const stopPointerAction = () => {
    dragRef.current = null
    setIsDragging(false)
    onEditEnd()
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopPointerAction)
  }

  return (
    <div
      className={`certificate-template-stage ${editable ? 'is-editable' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{
        width: `${safeTemplate.width * zoom}px`,
        height: `${safeTemplate.height * zoom}px`,
      }}
    >
      <div
        ref={canvasRef}
        className="certificate-template-canvas"
        style={{
          width: `${safeTemplate.width}px`,
          height: `${safeTemplate.height}px`,
          transform: `scale(${zoom})`,
          backgroundColor: safeTemplate.backgroundColor || '#ffffff',
          backgroundImage: safeTemplate.backgroundImage ? `url("${safeTemplate.backgroundImage}")` : 'none',
        }}
        onPointerDown={() => editable && onSelect('')}
      >
        {safeTemplate.elements
          .filter((element) => !element.hidden)
          .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))
          .map((element) => (
            <div
              className={`template-element type-${element.type} ${selectedElementId === element.id ? 'selected' : ''} ${element.locked ? 'locked' : ''}`}
              key={element.id}
              style={{
                left: `${element.x}px`,
                top: `${element.y}px`,
                width: `${element.width}px`,
                height: `${element.height}px`,
                opacity: element.opacity ?? 1,
                transform: `rotate(${Number(element.rotation) || 0}deg)`,
                zIndex: Number(element.zIndex) || 1,
              }}
              onPointerDown={(event) => startPointerAction(event, element)}
            >
              <ElementPreview
                element={element}
                data={data}
                editable={editable}
                isSelected={selectedElementId === element.id}
                onTextFocus={onEditStart}
                onTextBlur={onEditEnd}
                onTextChange={(content) => onElementChange(element.id, { content }, { track: false })}
              />
              {editable && selectedElementId === element.id && !element.locked && (
                <button
                  className="template-resize-handle"
                  type="button"
                  aria-label="Resize elemen"
                  onPointerDown={(event) => startPointerAction(event, element, 'resize')}
                />
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

export default CertificateTemplateCanvas
