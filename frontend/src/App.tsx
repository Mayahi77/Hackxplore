import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Send, Zap, Trash2, MessageSquare, GitBranch, BookOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { sendChat, type Message, type Source } from './api'
import { SourceBadge } from './components/SourceBadge'
import { UploadPanel } from './components/UploadPanel'
import { KnowledgeGraph } from './components/KnowledgeGraph'
import { NotesPanel } from './components/NotesPanel'
import './App.css'

type Tab = 'chat' | 'graph' | 'notes'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  loading?: boolean
  alreadyTried?: string
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: `## Welcome to TwoStroke AI

I'm your two-stroke engine troubleshooting assistant. Upload your technical documents, manuals, or test reports on the left, then describe your problem here.

**Try asking:**
- "Engine won't start — 500cc, spark plugs are fine"
- "Piston shows scoring marks on the intake side"
- "Unusual power loss at mid-range RPM"`,
}

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [alreadyTried, setAlreadyTried] = useState('')
  const [showAlreadyTried, setShowAlreadyTried] = useState(false)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const question = input.trim()
    if (!question || loading) return

    const tried = alreadyTried.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question, alreadyTried: tried || undefined }])
    setLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '', loading: true }])

    const history: Message[] = messages
      .filter(m => !m.loading)
      .slice(-6)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await sendChat(question, history, tried || undefined)
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: 'assistant', content: res.answer, sources: res.sources },
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
          <Zap size={20} />
          <span>TwoStroke AI</span>
        </div>
        <UploadPanel />
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <nav className="tabs">
            <button
              className={`tab-btn ${tab === 'chat' ? 'active' : ''}`}
              onClick={() => setTab('chat')}
            >
              <MessageSquare size={15} />
              Chat
            </button>
            <button
              className={`tab-btn ${tab === 'graph' ? 'active' : ''}`}
              onClick={() => setTab('graph')}
            >
              <GitBranch size={15} />
              Knowledge Graph
            </button>
            <button
              className={`tab-btn ${tab === 'notes' ? 'active' : ''}`}
              onClick={() => setTab('notes')}
            >
              <BookOpen size={15} />
              Capture
            </button>
          </nav>

          {tab === 'chat' && (
            <button
              className="icon-btn"
              onClick={() => { setMessages([WELCOME]); setAlreadyTried(''); setShowAlreadyTried(false) }}
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
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        {msg.alreadyTried && (
                          <div className="already-tried-tag">
                            <span className="already-tried-label">Already tried:</span> {msg.alreadyTried}
                          </div>
                        )}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="sources">
                            <p className="sources-label">Sources</p>
                            <div className="sources-list">
                              {msg.sources.map((s, j) => (
                                <SourceBadge key={j} source={s} />
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
                  className="send-btn"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
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

        {tab === 'graph' && <KnowledgeGraph />}
        {tab === 'notes' && <NotesPanel />}
      </main>
    </div>
  )
}
