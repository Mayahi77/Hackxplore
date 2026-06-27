import axios from 'axios'

const BASE = 'http://localhost:8000/api'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface Source {
  filename: string
  page: number | null
  doc_type: string | null
  relevance: number
}

export interface ChatResponse {
  answer: string
  sources: Source[]
  search_query: string
}

export interface GraphNode {
  id: string
  label: string
  type: string
  doc_type: string
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export async function sendChat(question: string, history: Message[]): Promise<ChatResponse> {
  const { data } = await axios.post<ChatResponse>(`${BASE}/chat/`, { question, history })
  return data
}

export async function uploadDocument(file: File): Promise<{ filename: string; chunks_indexed: number }> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await axios.post(`${BASE}/documents/upload`, form)
  return data
}

export async function getSources(): Promise<{ sources: string[]; total_chunks: number }> {
  const { data } = await axios.get(`${BASE}/documents/sources`)
  return data
}

export async function getHealth(): Promise<{ status: string; knowledge_base_chunks: number }> {
  const { data } = await axios.get(`${BASE}/chat/health`)
  return data
}

export async function getGraph(): Promise<GraphData> {
  const { data } = await axios.get<GraphData>(`${BASE}/graph/`)
  return data
}

export async function saveNote(text: string, title?: string): Promise<{ title: string; chunks_indexed: number }> {
  const { data } = await axios.post(`${BASE}/notes/`, { text, title: title ?? 'Quick Note' })
  return data
}
