import axios from 'axios'

// Normalize the configured API origin: trim whitespace and any trailing
// slashes so a value like "https://host/" or "/" can't produce a "//api" path
// (which resolves against the page origin and 404s on the deployed site).
const API_ORIGIN = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000')
  .trim()
  .replace(/\/+$/, '')

const BASE = `${API_ORIGIN}/api`

// ngrok's free tier serves an HTML interstitial for browser requests, which
// would break JSON parsing. This header tells ngrok to skip it.
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface Source {
  id?: string | null
  filename: string
  page: number | null
  doc_type: string | null
  relevance: number
  snippet?: string | null
  has_file?: boolean
}

export interface Hypothesis {
  title: string
  probability: 'high' | 'medium' | 'low'
  reasoning: string
  next_check: string
  citations: string[]
}

export interface TroubleshootingStep {
  step: number
  action: string
  expected_result: string
  if_not: string
  citations: string[]
}

export interface ChatResponse {
  answer: string
  summary?: string | null
  sources: Source[]
  search_query: string
  evidence_warning?: string | null
  clarifying_questions?: string[]
  hypotheses?: Hypothesis[]
  troubleshooting_steps?: TroubleshootingStep[]
  image_analysis?: string | null
  image_filename?: string | null
}

export interface GraphEvidence {
  id: string
  filename: string
  page: number | null
  doc_type: string | null
  discipline?: string | null
  modality?: string | null
  relevance: number
  snippet: string
  has_file?: boolean
}

export interface GraphNode {
  id: string
  label: string
  type: string
  doc_type: string
  evidence?: GraphEvidence[]
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  label?: string
  confidence?: number
  evidence?: GraphEvidence[]
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export async function sendChat(
  question: string,
  history: Message[],
  alreadyChecked?: string,
): Promise<ChatResponse> {
  const { data } = await axios.post<ChatResponse>(`${BASE}/chat/`, {
    question,
    history,
    already_checked: alreadyChecked || null,
  })
  return data
}

export async function sendChatWithImage(
  file: File,
  question: string,
  history: Message[],
  alreadyChecked?: string,
): Promise<ChatResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('question', question)
  form.append('history', JSON.stringify(history))
  if (alreadyChecked) form.append('already_checked', alreadyChecked)
  const { data } = await axios.post<ChatResponse>(`${BASE}/chat/image`, form)
  return data
}

export const DISCIPLINES = [
  'Mechanical',
  'Electrical',
  'Physics/Combustion',
  'Simulation Data',
  'General',
] as const

export type Discipline = (typeof DISCIPLINES)[number]

export interface UploadResult {
  filename: string
  segments_indexed: number
  discipline: string
  status: string
}

export interface ImageResult extends UploadResult {
  extracted_preview: string
}

export interface ImageExtraction {
  filename: string
  discipline: string
  extracted_text: string
  extracted_preview: string
  status: string
}

export interface IndexedDocument {
  source: string
  filename: string
  doc_type: string | null
  discipline: string
  segments: number
  visual_segments?: number
  has_file?: boolean
}

export function documentFileUrl(source: string): string {
  return `${BASE}/documents/file?source=${encodeURIComponent(source)}`
}

export interface SourcesResponse {
  sources: string[]
  documents: IndexedDocument[]
  disciplines: Record<string, number>
  total_chunks: number
  available_disciplines: string[]
}

export async function uploadDocument(file: File, discipline?: string): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  if (discipline) form.append('discipline', discipline)
  const { data } = await axios.post<UploadResult>(`${BASE}/documents/upload`, form)
  return data
}

export async function uploadImage(
  file: File,
  discipline?: string,
  caption?: string,
): Promise<ImageResult> {
  const form = new FormData()
  form.append('file', file)
  if (discipline) form.append('discipline', discipline)
  if (caption) form.append('caption', caption)
  const { data } = await axios.post<ImageResult>(`${BASE}/documents/image`, form)
  return data
}

export async function extractImage(
  file: File,
  discipline?: string,
  caption?: string,
): Promise<ImageExtraction> {
  const form = new FormData()
  form.append('file', file)
  if (discipline) form.append('discipline', discipline)
  if (caption) form.append('caption', caption)
  const { data } = await axios.post<ImageExtraction>(`${BASE}/documents/image/extract`, form)
  return data
}

export async function indexExtractedImage(
  file: File,
  extractedText: string,
  discipline?: string,
  caption?: string,
): Promise<ImageResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('extracted_text', extractedText)
  if (discipline) form.append('discipline', discipline)
  if (caption) form.append('caption', caption)
  const { data } = await axios.post<ImageResult>(`${BASE}/documents/image/index`, form)
  return data
}

export async function getSources(): Promise<SourcesResponse> {
  const { data } = await axios.get<Partial<SourcesResponse>>(`${BASE}/documents/sources`)
  // Normalize: an older/partial backend may omit the newer fields.
  return {
    sources: data.sources ?? [],
    documents: data.documents ?? [],
    disciplines: data.disciplines ?? {},
    total_chunks: data.total_chunks ?? 0,
    available_disciplines: data.available_disciplines ?? [...DISCIPLINES],
  }
}

export async function getHealth(): Promise<{ status: string; knowledge_base_chunks: number }> {
  const { data } = await axios.get(`${BASE}/chat/health`)
  return data
}

export async function getGraph(): Promise<GraphData> {
  const { data } = await axios.get<GraphData>(`${BASE}/graph/`)
  return data
}

export async function refreshGraph(): Promise<GraphData> {
  const { data } = await axios.post<GraphData>(`${BASE}/graph/refresh`)
  return data
}

export interface Note {
  source?: string
  title: string
  preview: string
  created_at?: string
  capture_origin?: 'manual' | 'voice'
}

export interface NoteValidationIssue {
  claim: string
  status: 'supported' | 'conflicting' | 'uncertain'
  explanation: string
  citations: string[]
}

export interface NoteValidationResult {
  verdict: 'supported' | 'conflicting' | 'uncertain'
  confidence: number
  summary: string
  issues: NoteValidationIssue[]
  sources: Source[]
}

export async function getNotes(): Promise<{ notes: Note[] }> {
  const { data } = await axios.get<{ notes: Note[] }>(`${BASE}/notes/`)
  return data
}

export async function validateNote(
  text: string,
  discipline?: string,
): Promise<NoteValidationResult> {
  const { data } = await axios.post<NoteValidationResult>(`${BASE}/notes/validate`, {
    text,
    discipline: discipline ?? null,
  })
  return data
}

export async function saveNote(
  text: string,
  title?: string,
  discipline?: string,
  options?: { captureOrigin?: 'manual' | 'voice'; reviewed?: boolean },
): Promise<{ title: string; segments_indexed: number; discipline: string }> {
  const { data } = await axios.post(`${BASE}/notes/`, {
    text,
    title: title ?? 'Quick Note',
    discipline: discipline ?? null,
    capture_origin: options?.captureOrigin ?? 'manual',
    reviewed: options?.reviewed ?? false,
  })
  return data
}

export async function cleanupKnowledgeBase(dryRun = true) {
  const { data } = await axios.post(`${BASE}/documents/maintenance/cleanup`, { dry_run: dryRun })
  return data as {
    dry_run: boolean
    duplicates_found: number
    duplicates_deleted: number
    metadata_updates: number
    total_chunks: number
  }
}

export async function deleteSource(source: string): Promise<{ source: string; chunks_deleted: number }> {
  const { data } = await axios.delete(`${BASE}/documents/source`, {
    params: { source },
  })
  return data
}

export interface GeminiKeyStatus {
  configured: boolean
  masked_key: string | null
  source: string
}

export async function getGeminiKeyStatus(): Promise<GeminiKeyStatus> {
  const { data } = await axios.get<GeminiKeyStatus>(`${BASE}/settings/gemini-key`)
  return data
}

export async function updateGeminiKey(apiKey: string): Promise<GeminiKeyStatus> {
  const { data } = await axios.put<GeminiKeyStatus>(`${BASE}/settings/gemini-key`, {
    api_key: apiKey,
  })
  return data
}
