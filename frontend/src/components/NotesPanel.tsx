import { useState, useRef } from 'react'
import { Mic, MicOff, Save, CheckCircle, AlertCircle } from 'lucide-react'
import { saveNote } from '../api'

interface ISpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
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

export function NotesPanel() {
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const recognitionRef = useRef<ISpeechRecognition | null>(null)

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
    rec.lang = 'en-US'

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join(' ')
      setText(transcript)
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

  async function handleSave() {
    if (!text.trim()) return
    setStatus('saving')
    try {
      await saveNote(text, title.trim() || 'Quick Note')
      setStatus('saved')
      setText('')
      setTitle('')
      setTimeout(() => setStatus('idle'), 2500)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed'
      setErrorMsg(msg)
      setStatus('error')
    }
  }

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <h2 className="panel-section-title">Capture Knowledge</h2>
        <p className="notes-subtitle">Type or speak — notes are indexed into the knowledge base</p>
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
        onChange={e => setText(e.target.value)}
        rows={10}
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
          className="save-note-btn"
          onClick={handleSave}
          disabled={!text.trim() || status === 'saving'}
        >
          <Save size={16} />
          {status === 'saving' ? 'Saving…' : 'Save to Knowledge Base'}
        </button>
      </div>

      {status === 'saved' && (
        <div className="notes-feedback success">
          <CheckCircle size={14} /> Note indexed successfully
        </div>
      )}
      {status === 'error' && (
        <div className="notes-feedback error">
          <AlertCircle size={14} /> {errorMsg}
        </div>
      )}
    </div>
  )
}
