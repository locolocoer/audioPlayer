import { app, net } from 'electron'
import fs from 'fs'
import path from 'path'

// AI 服务配置：支持 OpenAI 兼容格式（OpenAI/DeepSeek/通义/智谱等）与 Anthropic 格式（Claude）
export interface AiConfig {
  enabled: boolean
  provider: 'openai' | 'anthropic'
  baseUrl: string
  apiKey: string
  model: string
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiChatOptions {
  system?: string
  maxTokens?: number
  temperature?: number
}

const DEFAULT_CONFIG: AiConfig = {
  enabled: false,
  provider: 'openai',
  baseUrl: '',
  apiKey: '',
  model: ''
}

let config: AiConfig = { ...DEFAULT_CONFIG }

function configPath(): string {
  return path.join(app.getPath('userData'), 'ai-config.json')
}

export function loadAiConfig(): void {
  try {
    const raw = fs.readFileSync(configPath(), 'utf-8')
    const s = JSON.parse(raw)
    config = { ...DEFAULT_CONFIG, ...s }
  } catch { /* ignore */ }
}

export function getAiConfig(): AiConfig {
  return { ...config }
}

export function saveAiConfig(next: AiConfig): void {
  config = { ...DEFAULT_CONFIG, ...next }
  try {
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2))
  } catch { /* ignore */ }
}

async function request(url: string, init: RequestInit): Promise<Response> {
  // net.fetch 跟随系统代理，避免用户挂代理时直连失败
  return net.fetch(url, init)
}

// 解析 SSE 流，逐条回调 JSON
async function readSse(resp: Response, onData: (json: unknown) => void): Promise<void> {
  const reader = resp.body?.getReader()
  if (!reader) return
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try { onData(JSON.parse(payload)) } catch { /* ignore */ }
    }
  }
}

// 流式输出片段：reasoning=思考过程，content=正式回答（推理模型区分两通道）
export interface AiStreamPart {
  reasoning?: string
  content?: string
}

export interface AiUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface AiResult {
  ok: boolean
  text?: string
  reasoning?: string
  usage?: AiUsage
  error?: string
}

export async function aiChat(
  messages: AiMessage[],
  opts?: AiChatOptions
): Promise<AiResult> {
  return aiChatImpl(messages, opts, false)
}

// 流式聊天：part 逐段回调（打字机效果），思考与回答分开推送
export async function aiChatStream(
  messages: AiMessage[],
  opts: AiChatOptions | undefined,
  onPart: (part: AiStreamPart) => void
): Promise<AiResult> {
  return aiChatImpl(messages, opts, true, onPart)
}

async function aiChatImpl(
  messages: AiMessage[],
  opts?: AiChatOptions,
  stream = false,
  onPart?: (part: AiStreamPart) => void,
  cfgOverride?: AiConfig
): Promise<AiResult> {
  // 用本次请求的配置（测试连接传入临时配置时不改动全局 config，避免并发竞态）
  const cfg = cfgOverride ?? config
  if (!cfg.enabled || !cfg.apiKey) {
    return { ok: false, error: 'not-configured' }
  }
  const maxTokens = opts?.maxTokens || 1024
  try {
    if (cfg.provider === 'anthropic') {
      const base = (cfg.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '')
      const body: Record<string, unknown> = {
        model: cfg.model || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: messages.filter((m) => m.role !== 'system'),
        system: opts?.system || undefined,
        temperature: opts?.temperature ?? 0.7,
        ...(stream ? { stream: true } : {})
      }
      const resp = await request(base + '/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      })
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '')
        console.log(`[AI] Anthropic HTTP ${resp.status}: ${txt.slice(0, 500)}`)
        return { ok: false, error: `HTTP ${resp.status}: ${txt.slice(0, 300)}` }
      }
      if (stream) {
        let full = ''
        let chunks = 0
        let usage: AiUsage | undefined
        await readSse(resp, (json) => {
          const j = json as { type?: string; delta?: { type?: string; text?: string }; usage?: { input_tokens?: number; output_tokens?: number } }
          if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' && j.delta.text) {
            chunks++
            full += j.delta.text
            onPart?.({ content: j.delta.text })
          }
          if (j.usage) {
            usage = { prompt_tokens: j.usage.input_tokens, completion_tokens: j.usage.output_tokens }
          }
        })
        console.log(`[AI] anthropic stream done, chunks=${chunks}, fullLen=${full.length}`)
        if (!full) {
          console.log('[AI] anthropic stream empty, fallback to non-stream')
          return aiChatImpl(messages, opts, false, undefined, cfg)
        }
        return { ok: true, text: full, usage }
      }
      const data = await resp.json()
      const text = (data.content || [])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('')
      const u = data.usage as { input_tokens?: number; output_tokens?: number } | undefined
      const usage: AiUsage | undefined = u ? { prompt_tokens: u.input_tokens, completion_tokens: u.output_tokens } : undefined
      return { ok: true, text, usage }
    }
    // OpenAI 兼容格式
    const base = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '')
    let url = base
    if (!url.endsWith('/chat/completions')) {
      // OpenAI 官方域名不带 /v1 时补上；DeepSeek/通义/智谱等其余地址直接拼接即可
      url = url.includes('api.openai.com') && !url.endsWith('/v1') ? base + '/v1/chat/completions' : base + '/chat/completions'
    }
    const msgs = opts?.system ? [{ role: 'system', content: opts.system }, ...messages] : messages
    const resp = await request(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: msgs,
        max_tokens: maxTokens,
        temperature: opts?.temperature ?? 0.7,
        ...(stream ? { stream: true } : {})
      })
    })
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '')
      console.log(`[AI] OpenAI HTTP ${resp.status}: ${txt.slice(0, 500)}`)
      return { ok: false, error: `HTTP ${resp.status}: ${txt.slice(0, 300)}` }
    }
    if (stream) {
      let full = ''
      let fullReasoning = ''
      let chunks = 0
      let usage: AiUsage | undefined
      await readSse(resp, (json) => {
        const j = json as { choices?: { delta?: { content?: string; reasoning_content?: string } }[]; usage?: AiUsage }
        const d = j.choices?.[0]?.delta
        // 推理模型：思考过程在 reasoning_content，正式回答在 content，分开推送
        if (typeof d?.reasoning_content === 'string' && d.reasoning_content) {
          chunks++
          fullReasoning += d.reasoning_content
          onPart?.({ reasoning: d.reasoning_content })
        }
        if (typeof d?.content === 'string' && d.content) {
          chunks++
          full += d.content
          onPart?.({ content: d.content })
        }
        if (j.usage) usage = j.usage
      })
      console.log(`[AI] openai stream done, chunks=${chunks}, contentLen=${full.length}, reasoningLen=${fullReasoning.length}`)
      if (!full && !fullReasoning) {
        console.log('[AI] openai stream empty, fallback to non-stream')
        return aiChatImpl(messages, opts, false, undefined, cfg)
      }
      return { ok: true, text: full, reasoning: fullReasoning, usage }
    }
    const data = await resp.json()
    const msg = data.choices?.[0]?.message
    const reasoning = msg?.reasoning_content || ''
    const text = msg?.content || reasoning
    const usage = data.usage as AiUsage | undefined
    console.log(`[AI] openai non-stream status=${resp.status}, textLen=${text.length}, reasoningLen=${reasoning.length}`)
    return { ok: true, text, reasoning, usage }
  } catch (err) {
    console.log('[AI] 请求异常:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function testAiConnection(cfg?: AiConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await aiChatImpl(
      [{ role: 'user', content: 'ping' }],
      { system: 'Reply with exactly: OK', maxTokens: 10 },
      false,
      undefined,
      cfg
    )
    return { ok: r.ok, error: r.error }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
