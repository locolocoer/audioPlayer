import { describe, it, expect } from 'vitest'
import { buildBaseUrl } from './webdav'
import type { WebDAVConfig } from './types'

function config(over: Partial<WebDAVConfig>): WebDAVConfig {
  return {
    id: 't', name: 't', url: 'http://example.com', username: '', password: '',
    port: 80, enabled: true, createdAt: '2024-01-01', sourceType: 'webdav',
    ...over
  }
}

describe('buildBaseUrl URL 构造', () => {
  it('普通 http 地址拼上自定义端口', () => {
    expect(buildBaseUrl(config({ url: 'http://example.com', port: 8080 }))).toBe('http://example.com:8080')
  })

  it('https 地址拼上自定义端口', () => {
    expect(buildBaseUrl(config({ url: 'https://example.com', port: 8443 }))).toBe('https://example.com:8443')
  })

  it('URL 已显式包含端口时不重复拼接', () => {
    expect(buildBaseUrl(config({ url: 'http://example.com:8080', port: 9999 }))).toBe('http://example.com:8080')
    expect(buildBaseUrl(config({ url: 'https://example.com:8443', port: 8080 }))).toBe('https://example.com:8443')
  })

  it('http 默认端口 80 不拼接', () => {
    expect(buildBaseUrl(config({ url: 'http://example.com', port: 80 }))).toBe('http://example.com')
  })

  it('https 默认端口 443 不拼接', () => {
    expect(buildBaseUrl(config({ url: 'https://example.com', port: 443 }))).toBe('https://example.com')
  })

  it('端口为 0 或负数不拼接', () => {
    expect(buildBaseUrl(config({ url: 'http://example.com', port: 0 }))).toBe('http://example.com')
    expect(buildBaseUrl(config({ url: 'http://example.com', port: -1 }))).toBe('http://example.com')
  })

  it('去除尾部斜杠', () => {
    expect(buildBaseUrl(config({ url: 'http://example.com/', port: 8080 }))).toBe('http://example.com:8080')
    expect(buildBaseUrl(config({ url: 'http://example.com///', port: 8080 }))).toBe('http://example.com:8080')
  })
})
