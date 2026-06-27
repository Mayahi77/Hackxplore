import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Mic, MicOff, Save, CheckCircle, AlertCircle, ChevronDown, ChevronUp,
  FileText, Image as ImageIcon, Loader,
} from 'lucide-react'
import {
  saveNote,
  validateNote,
  getNotes,
  extractImage,
  indexExtractedImage,
  DISCIPLINES,
  type NoteValidationResult,
  type Note,
} from '../api'
import { SourceBadge } from './SourceBadge'

interface ISpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  lang: string
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: Event) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type SpeechRecognitionCtor = new () => ISpeechRecognition

declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionCtor
    webkitSpeechRecognition: SpeechRecognitionCtor
  }
}

interface NotesPanelProps {
  onKnowledgeAdded?: () => void
}

interface ImageState {
  status: 'idle' | 'processing' | 'review' | 'indexing' | 'done' | 'error'
  filename?: string
  file?: File
  extractedText?: string
  preview?: string
  segments?: number
  discipline?: string
  error?: string
}

export function NotesPanel({ onKnowledgeAdded }: NotesPanelProps) {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [discipline, setDiscipline] = useState('') // '' = auto-detect
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [notes, setNotes] = useState<Note[]>([])
  const [expandedNote, setExpandedNote] = useState<string | null>(null)
  const [image, setImage] = useState<ImageState>({ status: 'idle' })
  const [captureOrigin, setCaptureOrigin] = useState<'manual' | 'voice'>('manual')
  const [transcriptReviewed, setTranscriptReviewed] = useState(false)
  const [validation, setValidation] = useState<NoteValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const loadNotes = useCallback(async () => {
    try {
      const { notes: fetched } = await getNotes()
      setNotes(fetched)
    } catch {
      // silently ignore — backend may not have notes yet
    }
  }, [])

  useEffect(() => { loadNotes() }, [loadNotes])

  function startVoice() {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) {
      setErrorMsg('Voice input not supported in this browser (use Chrome)')
      setStatus('error')
      return
    }

    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 3
    rec.lang = 'en-US'

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join(' ')
      setText(transcript)
      setCaptureOrigin('voice')
      setTranscriptReviewed(false)
    }

    rec.onerror = () => {
      setRecording(false)
      setErrorMsg('Voice recording error')
      setStatus('error')
    }

    rec.onend = () => setRecording(false)

    rec.start()
    recognitionRef.current = rec
    setRecording(true)
    setStatus('idle')
  }

  function stopVoice() {
    recognitionRef.current?.stop()
    setRecording(false)
  }

  async function runValidation(): Promise<NoteValidationResult | null> {
    if (!text.trim()) return null
    setValidating(true)
    setStatus('idle')
    setErrorMsg('')
    try {
      const result = await validateNote(text, discipline || undefined)
      setValidation(result)
      return result
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      const msg = detail ?? (e instanceof Error ? e.message : 'Validation failed')
      setErrorMsg(msg)
      setStatus('error')
      return null
    } finally {
      setValidating(false)
    }
  }

  async function handleSave() {
    if (!text.trim()) return
    const needsReview = captureOrigin === 'voice'
    if (needsReview && !transcriptReviewed) {
      setErrorMsg('Review the voice transcript before saving it to the knowledge base')
      setStatus('error')
      return
    }

    const result = await runValidation()
    if (!result) return
    if (result.verdict === 'conflicting') {
      setErrorMsg('This note conflicts with the knowledge base. Review the cited issues before saving.')
      setStatus('error')
      return
    }

    setStatus('saving')
    try {
      await saveNote(text, title.trim() || 'Quick Note', discipline || undefined, {
        captureOrigin,
        reviewed: needsReview ? transcriptReviewed : true,
      })
      setStatus('saved')
      setText('')
      setTitle('')
      setCaptureOrigin('manual')
      setTranscriptReviewed(false)
      setValidation(null)
      await loadNotes()
      onKnowledgeAdded?.()
      setTimeout(() => setStatus('idle'), 2500)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  async function handleImage(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setImage({ status: 'processing', filename: file.name })
    try {
      const res = await extractImage(file, discipline || undefined, title.trim() || undefined)
      setImage({
        status: 'review',
        file,
        filename: res.filename,
        extractedText: res.extracted_text,
        preview: res.extracted_preview,
        discipline: res.discipline,
      })
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      const msg = detail ?? (e instanceof Error ? e.message : 'Image processing failed')
      setImage({ status: 'error', filename: file.name, error: msg })
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = ''
    }
  }

  function onImageDrop(e: React.DragEvent) {
    e.preventDefault()
    handleImage(e.dataTransfer.files)
  }

  async function confirmImageIndex() {
    if (!image.file || !image.extractedText?.trim()) return
    setImage(prev => ({ ...prev, status: 'indexing' }))
    try {
      const res = await indexExtractedImage(
        image.file,
        image.extractedText,
        discipline || image.discipline || undefined,
        title.trim() || undefined,
      )
      setImage(prev => ({
        ...prev,
        status: 'done',
        filename: res.filename,
        preview: res.extracted_preview,
        segments: res.segments_indexed,
        discipline: res.discipline,
      }))
      onKnowledgeAdded?.()
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      const msg = detail ?? (e instanceof Error ? e.message : 'Image indexing failed')
      setImage(prev => ({ ...prev, status: 'error', error: msg }))
    }
  }

  function handleTextChange(value: string) {
    setText(value)
    setValidation(null)
    if (!value.trim()) {
      setCaptureOrigin('manual')
      setTranscriptReviewed(false)
    } else if (captureOrigin === 'voice') {
      setTranscriptReviewed(false)
    }
  }

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <h2 className="panel-section-title">Add Knowledge</h2>
        <p className="notes-subtitle">Type, speak, or upload a screenshot — everything is added to the knowledge base</p>
      </div>

      <div className="discipline-picker">
        <label htmlFor="note-discipline" className="discipline-label">Discipline</label>
        <select
          id="note-discipline"
          className="discipline-select"
          value={discipline}
          onChange={e => setDiscipline(e.target.value)}
        >
          <option value="">Auto-detect</option>
          {DISCIPLINES.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <input
        className="notes-title-input"
        placeholder="Title (optional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />

      <textarea
        className="notes-textarea"
        placeholder="Describe a solution, observation, or expert insight…"
        value={text}
        onChange={e => handleTextChange(e.target.value)}
        rows={7}
      />

      <div className="notes-actions">
        <button
          className={`voice-btn ${recording ? 'recording' : ''}`}
          onClick={recording ? stopVoice : startVoice}
          title={recording ? 'Stop recording' : 'Start voice input'}
        >
          {recording ? <MicOff size={16} /> : <Mic size={16} />}
          {recording ? 'Stop' : 'Voice'}
        </button>

        <button
          className="validate-note-btn"
          onClick={runValidation}
          disabled={!text.trim() || validating || status === 'saving'}
        >
          {validating ? <Loader size={16} className="spin" /> : <AlertCircle size={16} />}
          {validating ? 'Checking…' : 'Check Against KB'}
        </button>

        <button
          className="save-note-btn"
          onClick={handleSave}
          disabled={!text.trim() || status === 'saving' || validating}
        >
          <Save size={16} />
          {status === 'saving' ? 'Saving…' : 'Save to Knowledge Base'}
        </button>
      </div>

      {captureOrigin === 'voice' && text.trim() && (
        <label className="review-confirm">
          <input
            type="checkbox"
            checked={transcriptReviewed}
            onChange={e => setTranscriptReviewed(e.target.checked)}
          />
          I reviewed the transcript, technical terms and numeric values
        </label>
      )}

      {validation && (
        <div className={`validation-panel ${validation.verdict}`}>
          <div className="validation-head">
            {validation.verdict === 'supported' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <div>
              <strong>
                {validation.verdict === 'supported'
                  ? 'Supported by knowledge base'
                  : validation.verdict === 'conflicting'
                    ? 'Conflicts with knowledge base'
                    : 'Not enough evidence to verify'}
              </strong>
              <span>{Math.round(validation.confidence * 100)}% confidence</span>
            </div>
          </div>
          <p className="validation-summary">{validation.summary}</p>

          {validation.issues.length > 0 && (
            <div className="validation-issues">
              {validation.issues.map((issue, index) => (
                <div key={`${issue.claim}-${index}`} className={`validation-issue ${issue.status}`}>
                  <div className="validation-issue-title">
                    <span>{issue.status}</span>
                    <strong>{issue.claim}</strong>
                  </div>
                  <p>{issue.explanation}</p>
                  {issue.citations.length > 0 && (
                    <div className="validation-citations">
                      {issue.citations.map(c => <span key={c}>{c}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {validation.sources.length > 0 && (
            <div className="validation-sources">
              <p className="sources-label">Validation evidence</p>
              <div className="sources-list">
                {validation.sources.map(source => (
                  <SourceBadge key={source.id ?? source.filename} source={source} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {status === 'saved' && (
        <div className="notes-feedback success">
          <CheckCircle size={14} /> Note added to the knowledge base
        </div>
      )}
      {status === 'error' && (
        <div className="notes-feedback error">
          <AlertCircle size={14} /> {errorMsg}
        </div>
      )}

      {/* ── Screenshot / diagram capture ── */}
      <div className="image-capture-section">
        <p className="image-capture-label">
          <ImageIcon size={14} /> Capture a diagram or screenshot
        </p>
        <div
          className="image-drop-zone"
          onClick={() => imageInputRef.current?.click()}
          onDrop={onImageDrop}
          onDragOver={e => e.preventDefault()}
        >
          {image.status === 'processing' ? (
            <>
              <Loader size={22} className="spin" />
              <p>Reading “{image.filename}” with AI vision…</p>
            </>
          ) : image.status === 'indexing' ? (
            <>
              <Loader size={22} className="spin" />
              <p>Adding reviewed content to the knowledge base…</p>
            </>
          ) : (
            <>
              <ImageIcon size={22} />
              <p>Drop an engineering diagram or screenshot here</p>
              <p className="drop-hint">PNG · JPG · WEBP — text & labels are extracted automatically</p>
            </>
          )}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
            style={{ display: 'none' }}
            onChange={e => handleImage(e.target.files)}
          />
        </div>

        {image.status === 'review' && (
          <div className="image-review">
            <div className="notes-feedback warning">
              <AlertCircle size={14} /> Review the extracted text before indexing it
            </div>
            <textarea
              className="image-review-textarea"
              value={image.extractedText ?? ''}
              onChange={e => setImage(prev => ({ ...prev, extractedText: e.target.value }))}
              rows={8}
            />
            <button
              className="save-note-btn"
              onClick={confirmImageIndex}
              disabled={!image.extractedText?.trim()}
            >
              <Save size={16} />
              Add Reviewed Content
            </button>
          </div>
        )}

        {image.status === 'done' && (
          <div className="image-result">
            <div className="notes-feedback success">
              <CheckCircle size={14} /> Added {image.segments} text segments · {image.discipline}
            </div>
            {image.preview && (
              <div className="image-extracted">
                <p className="image-extracted-label">Extracted content</p>
                <p className="image-extracted-text">{image.preview}{image.preview.length >= 400 ? '…' : ''}</p>
              </div>
            )}
          </div>
        )}
        {image.status === 'error' && (
          <div className="notes-feedback error">
            <AlertCircle size={14} /> {image.error}
          </div>
        )}
      </div>

      {notes.length > 0 && (
        <div className="saved-notes-section">
          <p className="panel-section-title">
            Saved notes <span className="notes-count">{notes.length}</span>
          </p>
          <ul className="saved-notes-list">
            {notes.map(note => {
              const noteKey = note.source ?? note.title
              const isOpen = expandedNote === noteKey
              return (
                <li key={noteKey} className="saved-note-card">
                  <button
                    className="saved-note-header"
                    onClick={() => setExpandedNote(isOpen ? null : noteKey)}
                  >
                    <FileText size={13} />
                    <span className="saved-note-title">{note.title}</span>
                    {note.capture_origin === 'voice' && <span className="note-origin">Voice</span>}
                    {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {isOpen && (
                    <p className="saved-note-preview">{note.preview}{note.preview.length >= 300 ? '…' : ''}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
