export type MainLang = 'zh' | 'en'

let lang: MainLang = 'zh'

export function setMainLang(l: MainLang): void {
  lang = l
}

export function getMainLang(): MainLang {
  return lang
}

const zh: Record<string, string> = {
  'tray.showHide': '显示 / 隐藏',
  'tray.playPause': '播放 / 暂停',
  'tray.prev': '上一首',
  'tray.next': '下一首',
  'tray.quit': '退出',

  'tag.ffmpegMissing': '未找到 FFmpeg（ffmpeg.exe），请重新安装应用',
  'tag.ffmpegFailed': 'FFmpeg 失败',
  'tag.invalidOutput': '输出文件无效',
  'tag.invalidFlac': '输出不是有效 FLAC',
  'tag.fileNotExist': '文件不存在',
  'tag.unsupportedFormat': '暂不支持写回该格式 ({ext})',
  'tag.writeFailed': '写入失败',

  'lrc.localOnly': '仅本地文件支持保存歌词',
  'cover.localOnly': '仅本地文件支持保存封面',
  'cover.mp3Only': '仅 MP3 支持写回封面',
  'cover.downloadFailed': '封面下载失败',
  'lrc.notFound': '未找到歌词',

  'dialog.chooseFolder': '选择本地音乐文件夹',
  'dialog.sqlite': 'SQLite 数据库'
}

const en: Record<string, string> = {
  'tray.showHide': 'Show / Hide',
  'tray.playPause': 'Play / Pause',
  'tray.prev': 'Previous',
  'tray.next': 'Next',
  'tray.quit': 'Quit',

  'tag.ffmpegMissing': 'FFmpeg (ffmpeg.exe) not found. Please reinstall the app.',
  'tag.ffmpegFailed': 'FFmpeg failed',
  'tag.invalidOutput': 'Invalid output file',
  'tag.invalidFlac': 'Output is not a valid FLAC',
  'tag.fileNotExist': 'File does not exist',
  'tag.unsupportedFormat': 'Write-back not supported for this format ({ext})',
  'tag.writeFailed': 'Write failed',

  'lrc.localOnly': 'Saving lyrics is only supported for local files',
  'cover.localOnly': 'Saving cover is only supported for local files',
  'cover.mp3Only': 'Only MP3 supports cover write-back',
  'cover.downloadFailed': 'Cover download failed',
  'lrc.notFound': 'No lyrics found',

  'dialog.chooseFolder': 'Choose local music folder',
  'dialog.sqlite': 'SQLite Database'
}

export function mt(key: string, vars?: Record<string, string | number>): string {
  const dict = lang === 'en' ? en : zh
  let text = dict[key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v))
    }
  }
  return text
}
