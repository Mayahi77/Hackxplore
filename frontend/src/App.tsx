import { useState, useRef, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send, Zap, Trash2, MessageSquare, GitBranch, PlusCircle, FileText, ChevronDown, ChevronUp, Settings, Image as ImageIcon, X } from 'lucide-react'
import {
  sendChat,
  sendChatWithImage,
  type Message,
  type Source,
  type Hypothesis,
  type TroubleshootingStep,
} from './api'
import { SourceBadge } from './components/SourceBadge'
import { KnowledgeStatus } from './components/KnowledgeStatus'
import { DocumentsPanel } from './components/DocumentsPanel'
import { KnowledgeGraph } from './components/KnowledgeGraph'
import { NotesPanel } from './components/NotesPanel'
import { SettingsPanel } from './components/SettingsPanel'
import './App.css'

type Tab = 'chat' | 'graph' | 'notes' | 'documents' | 'settings'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  summary?: string | null
  sources?: Source[]
  evidenceWarning?: string | null
  clarifyingQuestions?: string[]
  hypotheses?: Hypothesis[]
  troubleshootingSteps?: TroubleshootingStep[]
  uploadedImageName?: string
  imageAnalysis?: string | null
  loading?: boolean
  alreadyTried?: string
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: `## Welcome to StrokeIT

I'm your two-stroke engine troubleshooting assistant. Add your technical documents in the **Documents** tab, then describe your problem here.

**Try asking:**
- "Engine won't start — 500cc, spark plugs are fine"
- "Piston shows scoring marks on the intake side"
- "Unusual power loss at mid-range RPM"`,
}

function citationDomId(messageIndex: number, citationId: string) {
  return `message-${messageIndex}-source-${citationId}`
}

function CitationTag({ id, source, onClick }: { id: string; source?: Source; onClick?: () => void }) {
  return (
    <button
      className="citation-tag"
      title={source?.snippet ?? source?.filename ?? id}
      onClick={onClick}
      type="button"
    >
      {id}
    </button>
  )
}

function CitationList({
  citations,
  sourcesById,
  onCitationClick,
}: {
  citations: string[]
  sourcesById: Map<string, Source>
  onCitationClick?: (citationId: string) => void
}) {
  if (citations.length === 0) {
    return <span className="citation-missing">No direct source</span>
  }
  return (
    <span className="citation-list">
      {citations.map(id => (
        <CitationTag
          key={id}
          id={id}
          source={sourcesById.get(id)}
          onClick={() => onCitationClick?.(id)}
        />
      ))}
    </span>
  )
}

function StructuredAnswer({
  msg,
  onCitationClick,
}: {
  msg: ChatMessage
  onCitationClick?: (citationId: string) => void
}) {
  const sourcesById = new Map((msg.sources ?? []).filter(s => s.id).map(s => [s.id as string, s]))
  const hypotheses = msg.hypotheses ?? []
  const steps = msg.troubleshootingSteps ?? []
  const questions = msg.clarifyingQuestions ?? []

  return (
    <div className="structured-answer">
      <p>{msg.summary || msg.content}</p>

      {msg.evidenceWarning && (
        <div className="evidence-warning">
          {msg.evidenceWarning}
        </div>
      )}

      {hypotheses.length > 0 && (
        <section className="answer-section">
          <h3>Likely causes</h3>
          <div className="hypothesis-list">
            {hypotheses.map((h, index) => (
              <article key={`${h.title}-${index}`} className="hypothesis-card">
                <div className="hypothesis-head">
                  <span className={`probability ${h.probability}`}>{h.probability}</span>
                  <strong>{h.title}</strong>
                  <CitationList citations={h.citations} sourcesById={sourcesById} onCitationClick={onCitationClick} />
                </div>
                {h.reasoning && <p>{h.reasoning}</p>}
                {h.next_check && (
                  <p className="next-check">
                    <span>Check:</span> {h.next_check}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {steps.length > 0 && (
        <section className="answer-section">
          <h3>Troubleshooting</h3>
          <ol className="step-list">
            {steps.map(step => (
              <li key={step.step} className="step-item">
                <div className="step-title">
                  <span>{step.step}</span>
                  <strong>{step.action}</strong>
                  <CitationList citations={step.citations} sourcesById={sourcesById} onCitationClick={onCitationClick} />
                </div>
                {step.expected_result && <p>Expected: {step.expected_result}</p>}
                {step.if_not && <p>If not: {step.if_not}</p>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {questions.length > 0 && (
        <section className="answer-section">
          <h3>Clarify next</h3>
          <ul className="clarifying-list">
            {questions.map(q => <li key={q}>{q}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [alreadyTried, setAlreadyTried] = useState('')
  const [showAlreadyTried, setShowAlreadyTried] = useState(false)
  const [loading, setLoading] = useState(false)
  const [kbVersion, setKbVersion] = useState(0)
  const [expandedSourceKeys, setExpandedSourceKeys] = useState<Set<string>>(new Set())
  const [focusedSourceKey, setFocusedSourceKey] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const onKnowledgeAdded = useCallback(() => setKbVersion(v => v + 1), [])

  function handleImageSelect(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setSelectedImage(file)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  function sourceKey(messageIndex: number, sourceId: string) {
    return `${messageIndex}:${sourceId}`
  }

  function expandSource(messageIndex: number, sourceId: string) {
    const key = sourceKey(messageIndex, sourceId)
    setExpandedSourceKeys(prev => new Set(prev).add(key))
    setFocusedSourceKey(key)

    window.setTimeout(() => {
      document.getElementById(citationDomId(messageIndex, sourceId))?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }, 0)
    window.setTimeout(() => setFocusedSourceKey(current => current === key ? null : current), 1800)
  }

  function toggleSource(messageIndex: number, sourceId: string) {
    const key = sourceKey(messageIndex, sourceId)
    setExpandedSourceKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleSend() {
    const question = input.trim()
    if ((!question && !selectedImage) || loading) return

    const tried = alreadyTried.trim()
    const image = selectedImage
    setInput('')
    setSelectedImage(null)
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: question || 'Analyze uploaded image',
        alreadyTried: tried || undefined,
        uploadedImageName: image?.name,
      },
    ])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', loading: true }])

    const history: Message[] = messages
      .filter(m => !m.loading)
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = image
        ? await sendChatWithImage(image, question, history, tried || undefined)
        : await sendChat(question, history, tried || undefined)
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          content: res.answer,
          summary: res.summary,
          sources: res.sources,
          evidenceWarning: res.evidence_warning,
          clarifyingQuestions: res.clarifying_questions ?? [],
          hypotheses: res.hypotheses ?? [],
          troubleshootingSteps: res.troubleshooting_steps ?? [],
          imageAnalysis: res.image_analysis,
        },
      ])
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: 'Error connecting to backend. Check it is running and `GOOGLE_API_KEY` is set.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <Zap size={20} strokeWidth={2.4} />
          <span className="logo-text">
            <span>StrokeIT</span>
            <span className="logo-tag">Engine Diagnostics</span>
          </span>
        </div>
        <KnowledgeStatus refreshKey={kbVersion} onManage={() => setTab('documents')} />
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <nav className="tabs">
            <button
              className={`tab-btn ${tab === 'chat' ? 'active' : ''}`}
              onClick={() => setTab('chat')}
            >
              <MessageSquare size={15} />
              Ask AI
            </button>
            <button
              className={`tab-btn ${tab === 'graph' ? 'active' : ''}`}
              onClick={() => setTab('graph')}
            >
              <GitBranch size={15} />
              Concept Map
            </button>
            <button
              className={`tab-btn ${tab === 'notes' ? 'active' : ''}`}
              onClick={() => setTab('notes')}
            >
              <PlusCircle size={15} />
              Add Knowledge
            </button>
            <button
              className={`tab-btn ${tab === 'documents' ? 'active' : ''}`}
              onClick={() => setTab('documents')}
            >
              <FileText size={15} />
              Documents
            </button>
            <button
              className={`tab-btn ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => setTab('settings')}
            >
              <Settings size={15} />
              Settings
            </button>
          </nav>

          {tab === 'chat' && (
            <button
              className="icon-btn"
              onClick={() => {
                setMessages([WELCOME])
                setAlreadyTried('')
                setShowAlreadyTried(false)
                setExpandedSourceKeys(new Set())
                setFocusedSourceKey(null)
                setSelectedImage(null)
              }}
              title="Clear chat"
            >
              <Trash2 size={16} />
            </button>
          )}
        </header>

        {tab === 'chat' && (
          <>
            <div className="messages">
              {messages.map((msg, i) => (
                <div key={i} className={`message ${msg.role}`}>
                  <div className="bubble">
                    {msg.loading ? (
                      <div className="typing-indicator">
                        <span /><span /><span />
                      </div>
                    ) : (
                      <>
                        {(msg.hypotheses?.length || msg.troubleshootingSteps?.length || msg.clarifyingQuestions?.length) ? (
                          <StructuredAnswer msg={msg} onCitationClick={citationId => expandSource(i, citationId)} />
                        ) : (
                          <>
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                            {msg.evidenceWarning && (
                              <div className="evidence-warning">
                                {msg.evidenceWarning}
                              </div>
                            )}
                          </>
                        )}
                        {msg.alreadyTried && (
                          <div className="already-tried-tag">
                            <span className="already-tried-label">Already tried:</span> {msg.alreadyTried}
                          </div>
                        )}
                        {msg.uploadedImageName && (
                          <div className="uploaded-image-tag">
                            <ImageIcon size={13} />
                            <span>{msg.uploadedImageName}</span>
                          </div>
                        )}
                        {msg.imageAnalysis && (
                          <details className="image-analysis-details">
                            <summary>
                              <ImageIcon size={13} />
                              Image analysis used for this answer
                            </summary>
                            <p>{msg.imageAnalysis}</p>
                          </details>
                        )}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="sources">
                            <p className="sources-label">Cited {msg.sources.length} {msg.sources.length === 1 ? 'source' : 'sources'}</p>
                            <div className="sources-list">
                              {msg.sources.map((s, j) => (
                                <SourceBadge
                                  key={s.id ?? j}
                                  source={s}
                                  expanded={s.id ? expandedSourceKeys.has(sourceKey(i, s.id)) : undefined}
                                  focused={s.id ? focusedSourceKey === sourceKey(i, s.id) : false}
                                  onToggle={s.id ? () => toggleSource(i, s.id as string) : undefined}
                                  elementId={s.id ? citationDomId(i, s.id) : undefined}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="input-area">
              {selectedImage && (
                <div className="selected-image-row">
                  <div className="selected-image-chip">
                    <ImageIcon size={14} />
                    <span>{selectedImage.name}</span>
                    <button onClick={() => setSelectedImage(null)} title="Remove image">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              )}
              <div className="input-row">
                <textarea
                  className="input-box"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the engine problem… (Enter to send, Shift+Enter for new line)"
                  rows={3}
                />
                <button
                  className="attach-btn"
                  onClick={() => imageInputRef.current?.click()}
                  title="Attach image"
                  disabled={loading}
                >
                  <ImageIcon size={18} />
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
                  style={{ display: 'none' }}
                  onChange={e => handleImageSelect(e.target.files)}
                />
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={loading || (!input.trim() && !selectedImage)}
                >
                  <Send size={18} />
                </button>
              </div>

              <div className="already-tried-row">
                <button
                  className="already-tried-toggle"
                  onClick={() => setShowAlreadyTried(v => !v)}
                >
                  {showAlreadyTried ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  Already tried something?
                  {alreadyTried && <span className="already-tried-dot" />}
                </button>

                {showAlreadyTried && (
                  <input
                    className="already-tried-input"
                    value={alreadyTried}
                    onChange={e => setAlreadyTried(e.target.value)}
                    placeholder="e.g. spark plugs, carburetor, air filter…"
                  />
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'graph' && <KnowledgeGraph refreshKey={kbVersion} />}
        {tab === 'notes' && <NotesPanel onKnowledgeAdded={onKnowledgeAdded} />}
        {tab === 'documents' && <DocumentsPanel onKnowledgeAdded={onKnowledgeAdded} />}
        {tab === 'settings' && <SettingsPanel />}
      </main>
    </div>
  )
}
