import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader, Database } from 'lucide-react'
import { uploadDocument, getSources } from '../api'

interface UploadResult {
  filename: string
  chunks_indexed: number
  status: 'success' | 'error'
  message?: string
}

const EXT_ICON: Record<string, string> = {
  pdf: '📄',
  xlsx: '📊',
  xls: '📊',
  docx: '📝',
  doc: '📝',
  txt: '📃',
  md: '📃',
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  return EXT_ICON[ext] ?? '📎'
}

function baseName(path: string) {
  return path.split(/[/\\]/).pop() ?? path
}

export function UploadPanel() {
  const [results, setResults] = useState<UploadResult[]>([])
  const [loading, setLoading] = useState(false)
  const [sources, setSources] = useState<string[]>([])
  const [totalChunks, setTotalChunks] = useState(0)
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const refreshSources = useCallback(async () => {
    try {
      const data = await getSources()
      setSources(data.sources)
      setTotalChunks(data.total_chunks)
    } catch {
      // backend may not be ready yet — silently ignore
    } finally {
      setSourcesLoading(false)
    }
  }, [])

  useEffect(() => { refreshSources() }, [refreshSources])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setLoading(true)
    const uploads: UploadResult[] = []
    for (const file of Array.from(files)) {
      try {
        const res = await uploadDocument(file)
        uploads.push({ filename: res.filename, chunks_indexed: res.chunks_indexed, status: 'success' })
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        uploads.push({
          filename: file.name,
          chunks_indexed: 0,
          status: 'error',
          message: detail ?? 'Upload failed',
        })
      }
    }
    setResults(prev => [...uploads, ...prev])
    setLoading(false)
    await refreshSources()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="upload-panel">
      <h2 className="panel-title">Knowledge Base</h2>
      <div
        className="drop-zone"
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
      >
        {loading ? <Loader size={24} className="spin" /> : <Upload size={24} />}
        <p>Drop documents here or click to upload</p>
        <p className="drop-hint">PDF · DOCX · XLSX · TXT</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.md"
          style={{ display: 'none' }}
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {results.length > 0 && (
        <ul className="upload-results">
          {results.map((r, i) => (
            <li key={i} className={`upload-result ${r.status}`}>
              {r.status === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
              <span className="result-name">{r.filename}</span>
              {r.status === 'success' && (
                <span className="result-chunks">{r.chunks_indexed} chunks</span>
              )}
              {r.status === 'error' && <span className="result-error">{r.message}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="sources-section">
        <div className="sources-section-header">
          <div className="sources-section-title">
            <Database size={12} />
            <span>Indexed Documents</span>
          </div>
          {totalChunks > 0 && (
            <span className="sources-chunk-count">{totalChunks} chunks</span>
          )}
        </div>

        {sourcesLoading ? (
          <div className="sources-loading">
            <Loader size={14} className="spin" />
          </div>
        ) : sources.length === 0 ? (
          <p className="sources-empty">No documents indexed yet</p>
        ) : (
          <ul className="sources-list-sidebar">
            {sources.map(src => (
              <li key={src} className="source-item">
                <span className="source-item-icon">{fileIcon(src)}</span>
                <span className="source-item-name" title={src}>{baseName(src)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
