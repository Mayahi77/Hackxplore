import { useState } from 'react'
import type { Source } from '../api'
import { documentFileUrl } from '../api'
import { ChevronDown, ChevronUp, ExternalLink, FileText, FileSpreadsheet, File } from 'lucide-react'

const icons: Record<string, React.ElementType> = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  docx: File,
  doc: File,
  txt: File,
}

interface SourceBadgeProps {
  source: Source
  expanded?: boolean
  focused?: boolean
  onToggle?: () => void
  elementId?: string
}

export function SourceBadge({ source, expanded: controlledExpanded, focused = false, onToggle, elementId }: SourceBadgeProps) {
  const [localExpanded, setLocalExpanded] = useState(false)
  const Icon = icons[source.doc_type ?? 'txt'] ?? File
  const pct = Math.round(source.relevance * 100)
  const hasSnippet = Boolean(source.snippet?.trim())
  const expanded = controlledExpanded ?? localExpanded
  const fileUrl = source.has_file
    ? `${documentFileUrl(source.filename)}${source.doc_type === 'pdf' && source.page ? `#page=${source.page}` : ''}`
    : ''

  function handleToggle() {
    if (!hasSnippet) return
    if (onToggle) onToggle()
    else setLocalExpanded(v => !v)
  }

  return (
    <div
      id={elementId}
      className={`source-evidence ${expanded ? 'expanded' : ''} ${focused ? 'focused' : ''}`}
    >
      <div className="source-badge">
        <button
          className="source-expand"
          onClick={handleToggle}
          disabled={!hasSnippet}
          title={hasSnippet ? 'Show relevant text' : 'No snippet available'}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
        <Icon size={12} />
        {source.id && <span className="source-id">{source.id}</span>}
        {source.has_file ? (
          <a
            className="source-name source-link"
            href={fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={source.doc_type === 'pdf' && source.page ? `Open PDF at page ${source.page}` : 'Open referenced file'}
          >
            {source.filename}
            <ExternalLink size={10} />
          </a>
        ) : (
          <span className="source-name" title={source.filename}>{source.filename}</span>
        )}
        {source.page && <span className="source-page">p.{source.page}</span>}
        <span className="source-score">{pct}%</span>
      </div>
      {expanded && hasSnippet && (
        <div className="source-snippet">
          {source.snippet}
        </div>
      )}
    </div>
  )
}
