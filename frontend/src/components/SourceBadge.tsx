import type { Source } from '../api'
import { FileText, FileSpreadsheet, File } from 'lucide-react'

const icons: Record<string, React.ElementType> = {
  pdf: FileText,
  xlsx: FileSpreadsheet,
  xls: FileSpreadsheet,
  docx: File,
  doc: File,
  txt: File,
}

export function SourceBadge({ source }: { source: Source }) {
  const Icon = icons[source.doc_type ?? 'txt'] ?? File
  const pct = Math.round(source.relevance * 100)

  return (
    <div className="source-badge">
      <Icon size={12} />
      <span className="source-name">{source.filename}</span>
      {source.page && <span className="source-page">p.{source.page}</span>}
      <span className="source-score">{pct}%</span>
    </div>
  )
}
