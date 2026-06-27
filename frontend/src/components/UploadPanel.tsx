import { useState, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { uploadDocument } from '../api'

interface UploadResult {
  filename: string
  chunks_indexed: number
  status: 'success' | 'error'
  message?: string
}

export function UploadPanel() {
  const [results, setResults] = useState<UploadResult[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setLoading(true)
    const uploads: UploadResult[] = []
    for (const file of Array.from(files)) {
      try {
        const res = await uploadDocument(file)
        uploads.push({ filename: res.filename, chunks_indexed: res.chunks_indexed, status: 'success' })
      } catch (e: any) {
        uploads.push({
          filename: file.name,
          chunks_indexed: 0,
          status: 'error',
          message: e?.response?.data?.detail ?? 'Upload failed',
        })
      }
    }
    setResults(prev => [...uploads, ...prev])
    setLoading(false)
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
    </div>
  )
}
