import { useMemo, useRef, useState } from 'react'
import {
  normalizeCertificateTemplate,
  replaceCertificatePlaceholders,
} from '../lib/certificateTemplate'
import { createQrMatrix, getCertificateVerificationUrl } from '../lib/qrCode'
import Icon from './Icon'

const resizeHandles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function QrPreview({ element, data }) {
  const qr = createQrMatrix(getCertificateVerificationUrl(data))

  return (
    <div
      className="template-qr-preview"
      title={qr.value}
      style={{
        background: element.background || '#ffffff',
        color: element.color || '#111827',
        gridTemplateColumns: `repeat(${qr.size}, 1fr)`,
      }}
    >
      {qr.modules.flatMap((row, rowIndex) =>
        row.map((isDark, colIndex) => (
          <i className={isDark ? 'active' : ''} key={`${rowIndex}-${colIndex}`}></i>
        )),
      )}
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
  isEditing = false,
  onTextFocus = () => {},
  onTextBlur = () => {},
  onTextChange = () => {},
}) {
  if (element.type === 'text') {
    if (editable && isSelected && isEditing && !element.locked) {
      return (
        <textarea
          className="template-text-preview template-text-editor"
          value={element.content || ''}
          style={editableTextElementStyle(element)}
          autoFocus
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
  editingElementId = '',
  onSelect = () => {},
  onStartTextEdit = () => {},
  onEndTextEdit = () => {},
  onElementChange = () => {},
  onEditStart = () => {},
  onEditEnd = () => {},
}) {
  const safeTemplate = useMemo(() => normalizeCertificateTemplate(template), [template])
  const canvasRef = useRef(null)
  const dragRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)

  const applySnap = (value, forceSnap = false) => {
    if (!safeTemplate.snapToGrid || !forceSnap) {
      return Math.round(value * 10) / 10
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
    event.currentTarget.setPointerCapture?.(event.pointerId)
    onEditStart()
    onSelect(element.id)
    dragRef.current = {
      id: element.id,
      mode,
      elementType: element.type,
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

    if (String(drag.mode).startsWith('resize')) {
      const direction = String(drag.mode).replace('resize:', '') || 'se'
      const minSize = drag.elementType === 'line' ? 4 : 20
      let nextX = drag.startLeft
      let nextY = drag.startTop
      let nextWidth = drag.startWidth
      let nextHeight = drag.startHeight

      if (direction.includes('e')) {
        nextWidth = drag.startWidth + deltaX
      }
      if (direction.includes('s')) {
        nextHeight = drag.startHeight + deltaY
      }
      if (direction.includes('w')) {
        nextWidth = drag.startWidth - deltaX
        nextX = drag.startLeft + deltaX
      }
      if (direction.includes('n')) {
        nextHeight = drag.startHeight - deltaY
        nextY = drag.startTop + deltaY
      }

      if (nextWidth < minSize) {
        if (direction.includes('w')) {
          nextX = drag.startLeft + drag.startWidth - minSize
        }
        nextWidth = minSize
      }

      if (nextHeight < minSize) {
        if (direction.includes('n')) {
          nextY = drag.startTop + drag.startHeight - minSize
        }
        nextHeight = minSize
      }

      onElementChange(drag.id, {
        x: applySnap(nextX, event.shiftKey),
        y: applySnap(nextY, event.shiftKey),
        width: Math.max(minSize, applySnap(nextWidth, event.shiftKey)),
        height: Math.max(minSize, applySnap(nextHeight, event.shiftKey)),
      }, { track: false })
      return
    }

    onElementChange(drag.id, {
      x: applySnap(drag.startLeft + deltaX, event.shiftKey),
      y: applySnap(drag.startTop + deltaY, event.shiftKey),
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
        onPointerDown={() => {
          if (editable) {
            onSelect('')
            onEndTextEdit()
          }
        }}
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
              onDoubleClick={(event) => {
                if (editable && element.type === 'text' && !element.locked) {
                  event.preventDefault()
                  event.stopPropagation()
                  onSelect(element.id)
                  onStartTextEdit(element.id)
                  onEditStart()
                }
              }}
            >
              <ElementPreview
                element={element}
                data={data}
                editable={editable}
                isSelected={selectedElementId === element.id}
                isEditing={editingElementId === element.id}
                onTextFocus={onEditStart}
                onTextBlur={() => {
                  onEditEnd()
                  onEndTextEdit()
                }}
                onTextChange={(content) => onElementChange(element.id, { content }, { track: false })}
              />
              {editable && selectedElementId === element.id && !element.locked && (
                resizeHandles.map((handle) => (
                  <button
                    className={`template-resize-handle handle-${handle}`}
                    type="button"
                    aria-label={`Resize ${handle}`}
                    key={handle}
                    onPointerDown={(event) => startPointerAction(event, element, `resize:${handle}`)}
                  />
                ))
              )}
            </div>
          ))}
      </div>
    </div>
  )
}

export default CertificateTemplateCanvas
