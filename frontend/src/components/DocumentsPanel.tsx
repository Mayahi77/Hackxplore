import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader, Database, Download } from 'lucide-react'
import { uploadDocument, getSources, documentFileUrl, DISCIPLINES, type IndexedDocument } from '../api'

interface UploadFeedback {
  filename: string
  segments: number
  discipline: string
  status: 'success' | 'error'
  message?: string
}

const EXT_ICON: Record<string, string> = {
  pdf: '📄',
  pptx: '📽️',
  ppt: '📽️',
  xlsx: '📊',
  xls: '📊',
  docx: '📝',
  doc: '📝',
  txt: '📃',
  md: '📃',
  image: '🖼️',
}

function fileIcon(name: string, docType?: string | null) {
  if (docType && EXT_ICON[docType]) return EXT_ICON[docType]
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICON[ext] ?? '📎'
}

function baseName(path: string) {
  return path.split(/[/\\]/).pop() ?? path
}

interface DocumentsPanelProps {
  onKnowledgeAdded?: () => void
}

export function DocumentsPanel({ onKnowledgeAdded }: DocumentsPanelProps) {
  const [feedback, setFeedback] = useState<UploadFeedback[]>([])
  const [loading, setLoading] = useState(false)
  const [documents, setDocuments] = useState<IndexedDocument[]>([])
  const [disciplineCounts, setDisciplineCounts] = useState<Record<string, number>>({})
  const [discipline, setDiscipline] = useState('') // '' = auto-detect
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await getSources()
      setDocuments(data.documents)
      setDisciplineCounts(data.disciplines)
    } catch {
      // backend may not be ready yet — silently ignore
    } finally {
      setSourcesLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setLoading(true)
    const results: UploadFeedback[] = []
    for (const file of Array.from(files)) {
      try {
        const res = await uploadDocument(file, discipline || undefined)
        results.push({
          filename: res.filename,
          segments: res.segments_indexed,
          discipline: res.discipline,
          status: 'success',
        })
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        results.push({
          filename: file.name,
          segments: 0,
          discipline: '',
          status: 'error',
          message: detail ?? 'Upload failed',
        })
      }
    }
    setFeedback(prev => [...results, ...prev])
    setLoading(false)
    await refresh()
    if (results.some(result => result.status === 'success')) {
      onKnowledgeAdded?.()
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  const totalDocs = documents.length

  return (
    <div className="data-panel">
      <div className="data-header">
        <h2 className="panel-section-title">Documents</h2>
        <p className="notes-subtitle">
          Upload manuals, presentations, spreadsheets and reports. They are processed in the
          background and added to the knowledge base.
        </p>
      </div>

      <div className="discipline-picker">
        <label htmlFor="doc-discipline" className="discipline-label">Discipline</label>
        <select
          id="doc-discipline"
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

      <div
        className="drop-zone drop-zone-lg"
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
      >
        {loading ? <Loader size={28} className="spin" /> : <Upload size={28} />}
        <p>Drop documents here or click to upload</p>
        <p className="drop-hint">PDF · PPTX · DOCX · XLSX · TXT · MD</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.pptx,.xlsx,.txt,.md"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {feedback.length > 0 && (
        <ul className="upload-results">
          {feedback.map((r, i) => (
            <li key={i} className={`upload-result ${r.status}`}>
              {r.status === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <span className="result-name">{baseName(r.filename)}</span>
              {r.status === 'success' ? (
                <>
                  <span className="result-discipline">{r.discipline}</span>
                  <span className="result-chunks">Added · {r.segments} text segments</span>
                </>
              ) : (
                <span className="result-error">{r.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {Object.keys(disciplineCounts).length > 0 && (
        <div className="discipline-summary">
          {DISCIPLINES.filter(d => disciplineCounts[d]).map(d => (
            <span key={d} className="discipline-chip">
              {d}
              <span className="discipline-chip-count">{disciplineCounts[d]}</span>
            </span>
          ))}
        </div>
      )}

      <div className="data-docs-section">
        <div className="sources-section-header">
          <div className="sources-section-title">
            <Database size={13} />
            <span>Knowledge base · {totalDocs} {totalDocs === 1 ? 'document' : 'documents'}</span>
          </div>
        </div>

        {sourcesLoading ? (
          <div className="sources-loading"><Loader size={16} className="spin" /></div>
        ) : documents.length === 0 ? (
          <p className="sources-empty">No documents added yet</p>
        ) : (
          <ul className="data-docs-list">
            {documents.map(doc => (
              <li key={doc.source} className="data-doc-item">
                <span className="source-item-icon">{fileIcon(doc.filename, doc.doc_type)}</span>
                <span className="source-item-name" title={doc.filename}>{baseName(doc.filename)}</span>
                <span className="data-doc-discipline">{doc.discipline}</span>
                <span className="data-doc-segments">{doc.segments} segments</span>
                {!!doc.visual_segments && (
                  <span className="data-doc-visual">{doc.visual_segments} visual</span>
                )}
                {doc.has_file && (
                  <a
                    className="data-doc-download"
                    href={documentFileUrl(doc.source)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download original file"
                    onClick={e => e.stopPropagation()}
                  >
                    <Download size={14} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
