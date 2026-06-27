import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle, KeyRound, Loader, Save } from 'lucide-react'
import { getGeminiKeyStatus, updateGeminiKey, type GeminiKeyStatus } from '../api'

export function SettingsPanel() {
  const [status, setStatus] = useState<GeminiKeyStatus | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getGeminiKeyStatus()
        if (!cancelled) setStatus(data)
      } catch {
        if (!cancelled) setMessage({ type: 'error', text: 'Could not load settings from backend' })
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function handleSave() {
    const nextKey = apiKey.trim()
    if (!nextKey) {
      setMessage({ type: 'error', text: 'Enter a Gemini API key before saving' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const data = await updateGeminiKey(nextKey)
      setStatus(data)
      setApiKey('')
      setMessage({ type: 'success', text: 'Gemini API key updated' })
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setMessage({ type: 'error', text: detail ?? 'Failed to update Gemini API key' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2 className="panel-section-title">Settings</h2>
        <p className="notes-subtitle">Manage the AI provider key used by chat, image vision and PowerPoint visual extraction.</p>
      </div>

      <section className="settings-section">
        <div className="settings-section-title">
          <KeyRound size={16} />
          <span>Gemini API key</span>
        </div>

        {loading ? (
          <div className="settings-loading">
            <Loader size={16} className="spin" />
          </div>
        ) : (
          <>
            <div className={`settings-status ${status?.configured ? 'configured' : 'missing'}`}>
              {status?.configured ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
              <span>{status?.configured ? `Configured (${status.masked_key})` : 'Not configured'}</span>
            </div>

            <label className="settings-field">
              <span>New API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="Paste Gemini API key"
                autoComplete="off"
              />
            </label>

            <button
              className="settings-save-btn"
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
              {saving ? 'Saving…' : 'Save Key'}
            </button>
          </>
        )}

        {message && (
          <div className={`notes-feedback ${message.type}`}>
            {message.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {message.text}
          </div>
        )}
      </section>
    </div>
  )
}
