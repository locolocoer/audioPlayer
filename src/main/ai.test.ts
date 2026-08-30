import { describe, it, expect, beforeEach, vi } from 'vitest'
import { net } from 'electron'
import { testAiConnection, saveAiConfig, getAiConfig, aiChat } from './ai'
import type { AiConfig } from './ai'

/**
 * ai.ts 核心回归点：
 * 1. testAiConnection 传临时配置时不再改写全局 config（曾因并发竞态修过）
 * 2. OpenAI/Anthropic 分支按 cfg 构造请求（baseUrl/model/apiKey/headers）
 */

const fetchMock = vi.mocked(net.fetch)

beforeEach(() => {
  fetchMock.mockReset()
  // 恢复默认全局配置（未配置状态）
  saveAiConfig({ enabled: false, provider: 'openai', baseUrl: '', apiKey: '', model: '' })
})

describe('testAiConnection 临时配置不改全局 config', () => {
  it('使用传入 cfg 发起请求，全局配置保持不变', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), { status: 200 })
    )
    const cfg: AiConfig = { enabled: true, provider: 'openai', baseUrl: 'https://api.deepseek.com', apiKey: 'sk-test', model: 'deepseek-chat' }
    const r = await testAiConnection(cfg)

    expect(r.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 全局 config 未被污染
    expect(getAiConfig()).toMatchObject({ enabled: false, apiKey: '' })
    // 请求用的是 cfg 的 baseUrl + apiKey + model
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.deepseek.com/chat/completions')
    const headers = init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-test')
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('deepseek-chat')
  })

  it('未配置时返回 not-configured 且不发请求', async () => {
    const r = await testAiConnection({ enabled: false, provider: 'openai', baseUrl: '', apiKey: '', model: '' })
    expect(r).toEqual({ ok: false, error: 'not-configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Anthropic 分支请求构造', () => {
  it('按 cfg 拼 /v1/messages 与 x-api-key', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: 'text', text: 'OK' }] }), { status: 200 })
    )
    const r = await testAiConnection({
      enabled: true,
      provider: 'anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'sk-ant-test',
      model: 'claude-sonnet-4-20250514'
    })
    expect(r.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages')
    const headers = init?.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-ant-test')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('claude-sonnet-4-20250514')
    expect(body.max_tokens).toBe(10)
  })
})

describe('aiChat 使用全局配置', () => {
  it('未启用时返回 not-configured', async () => {
    const r = await aiChat([{ role: 'user', content: 'hi' }])
    expect(r).toEqual({ ok: false, error: 'not-configured' })
  })

  it('启用后走全局配置的模型与 key', async () => {
    saveAiConfig({ enabled: true, provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-global', model: 'gpt-4o-mini' })
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'hi' } }] }), { status: 200 })
    )
    const r = await aiChat([{ role: 'user', content: 'hi' }], { maxTokens: 20 })
    expect(r.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    // openai.com 官方域名自动补 /v1/chat/completions
    expect(String(url)).toBe('https://api.openai.com/v1/chat/completions')
    const headers = init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer sk-global')
    const body = JSON.parse(String(init?.body))
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.max_tokens).toBe(20)
  })
})
