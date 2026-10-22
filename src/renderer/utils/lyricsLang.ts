export type LyricLang = 'zh' | 'en'

/**
 * 判断歌词是否已经是目标语言（用于决定是否需要 AI 翻译）：
 * - zh：歌词包含中文字符即视为中文
 * - en：歌词不含中文字符即视为英文（中文以外一律可翻译成中文/英文）
 */
export function isLyricsInTargetLang(text: string, lang: LyricLang): boolean {
  const hasChinese = /[\u4e00-\u9fff]/.test(text || '')
  return lang === 'zh' ? hasChinese : !hasChinese
}
