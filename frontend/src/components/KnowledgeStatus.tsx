import { useEffect, useState, useCallback } from 'react'
import { Database, FolderOpen } from 'lucide-react'
import { getSources, DISCIPLINES } from '../api'

interface KnowledgeStatusProps {
  /** Bumped by the parent whenever new knowledge is added, to trigger a refresh. */
  refreshKey?: number
  /** Jump to the Documents tab. */
  onManage?: () => void
}

export function KnowledgeStatus({ refreshKey = 0, onManage }: KnowledgeStatusProps) {
  const [docCount, setDocCount] = useState(0)
  const [disciplineCounts, setDisciplineCounts] = useState<Record<string, number>>({})
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await getSources()
      setDocCount(data.documents.length)
      setDisciplineCounts(data.disciplines)
      setReady(true)
    } catch {
      // backend may not be ready yet — leave status empty
    }
  }, [])

  useEffect(() => { refresh() }, [refresh, refreshKey])

  const activeDisciplines = DISCIPLINES.filter(d => disciplineCounts[d])

  return (
    <div className="kb-status">
      <div className="kb-status-main">
        <Database size={18} />
        <div className="kb-status-text">
          <span className="kb-status-count">{ready ? docCount : '—'}</span>
          <span className="kb-status-label">
            {docCount === 1 ? 'document in knowledge base' : 'documents in knowledge base'}
          </span>
        </div>
      </div>

      {activeDisciplines.length > 0 && (
        <div className="kb-status-disciplines">
          {activeDisciplines.map(d => (
            <span key={d} className="kb-discipline-tag">{d}</span>
          ))}
        </div>
      )}

      {onManage && (
        <button className="kb-manage-btn" onClick={onManage}>
          <FolderOpen size={14} />
          Manage documents
        </button>
      )}
    </div>
  )
}
