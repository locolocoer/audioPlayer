import { useEffect, useState, useMemo, useCallback, useRef, useLayoutEffect } from 'react'
import { useMusicStore } from '../stores/musicStore'
import { usePlayerStore } from '../stores/playerStore'
import { usePlaylistStore } from '../stores/playlistStore'
import { useToastStore } from '../stores/toastStore'
import { useT } from '../i18n'
import { useVirtualWindow } from '../hooks/useVirtualWindow'
import MusicList from '../components/MusicList'
import Modal from '../components/Modal'
import PlaylistPickerModal from '../components/PlaylistPickerModal'
import { getCoverCached, setCoverCached, coverCacheKey } from '../utils/coverCache'
import type { MusicFile } from '../../main/types'

type SortField = 'title' | 'artist' | 'album' | 'duration' | 'playCount' | 'lastPlayed' | 'rating'
type SortDir = 'asc' | 'desc'
type ViewMode = 'songs' | 'albums' | 'artists' | 'folders'

function splitPath(p: string): string[] {
  return p.split(/[\\/]+/).filter(Boolean)
}

const UNKNOWN_ALBUM = '__unknown_album__'
const UNKNOWN_ARTIST = '__unknown_artist__'

const SORT_FIELDS: { field: SortField; labelKey: string }[] = [
  { field: 'title', labelKey: 'library.sort.title' },
  { field: 'artist', labelKey: 'library.sort.artist' },
  { field: 'album', labelKey: 'library.sort.album' },
  { field: 'duration', labelKey: 'library.sort.duration' },
  { field: 'playCount', labelKey: 'library.sort.playCount' },
  { field: 'lastPlayed', labelKey: 'library.sort.lastPlayed' },
  { field: 'rating', labelKey: 'library.sort.rating' }
]

const ALBUM_GRID_GAP = 16
const ALBUM_GRID_PAD = 8

function AlbumCover({ album, tracks }: { album: string; tracks: MusicFile[] }): JSX.Element {
  const [coverUrl, setCoverUrl] = useState('')
  const [inView, setInView] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const loadSeqRef = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setInView(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!inView) return
    const first = tracks[0]
    if (!first) return
    const seq = ++loadSeqRef.current
    const key = coverCacheKey(first)
    const cached = getCoverCached(key)
    if (cached) {
      setCoverUrl(cached)
      return
    }
    window.api.player.getCover(first.webdavId, first.path).then((r) => {
      if (seq !== loadSeqRef.current) return
      if (r.data && r.data.length > 0) {
        const blob = new Blob([new Uint8Array(r.data)], { type: r.format || 'image/jpeg' })
        const url = URL.createObjectURL(blob)
        setCoverCached(key, url)
        setCoverUrl(url)
      }
    }).catch(() => {})
  }, [inView, album, tracks])

  if (coverUrl) return <img className="album-cover" src={coverUrl} alt="" loading="lazy" />
  return (
    <div className="album-cover-placeholder" ref={ref}>
      <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
      </svg>
    </div>
  )
}

export default function LibraryPage(): JSX.Element {
  const { tracks, loadTracks, configs, loadConfigs } = useMusicStore()
  const t = useT()
  const addToast = useToastStore((s) => s.addToast)
  const [pickerTracks, setPickerTracks] = useState<MusicFile[] | null>(null)
  // AI 分类打标
  const [aiTags, setAiTags] = useState<Map<number, string[]>>(new Map())
  const [classifying, setClassifying] = useState(false)
  const [classifyProgress, setClassifyProgress] = useState<{ done: number; total: number } | null>(null)
  const classifyCancelRef = useRef(false)
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set())
  const [tagsOpen, setTagsOpen] = useState(false)

  useEffect(() => {
    window.api.music.getAiTags().then((list) => {
      setAiTags(new Map(list.map((x) => [x.trackId, x.tags])))
    }).catch(() => {})
  }, [])

  const displayName = (name: string): string => {
    if (name === UNKNOWN_ALBUM) return t('library.unknownAlbum')
    if (name === UNKNOWN_ARTIST) return t('library.unknownArtist')
    return name
  }
  const [search, setSearch] = useState(() => localStorage.getItem('library_search') || '')
  const [sortField, setSortField] = useState<SortField>(() => {
    const saved = localStorage.getItem('library_sortField') as SortField | null
    return saved && ['title', 'artist', 'album', 'duration', 'playCount', 'lastPlayed', 'rating'].includes(saved) ? saved : 'title'
  })
  const [sortDir, setSortDir] = useState<SortDir>(() => (localStorage.getItem('library_sortDir') === 'desc' ? 'desc' : 'asc'))
  const [filterConfig, setFilterConfig] = useState<string>(() => localStorage.getItem('library_filterConfig') || '')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('library_viewMode') as ViewMode | null
    return saved === 'albums' || saved === 'artists' || saved === 'folders' ? saved : 'songs'
  })
  const [browseAlbum, setBrowseAlbum] = useState<string | null>(() => localStorage.getItem('library_browseAlbum'))
  const [browseArtist, setBrowseArtist] = useState<string | null>(() => localStorage.getItem('library_browseArtist'))
  const [browseFolder, setBrowseFolder] = useState<string | null>(() => localStorage.getItem('library_browseFolder'))
  const [artistMenu, setArtistMenu] = useState<{ x: number; y: number; name: string } | null>(null)
  const [editArtistName, setEditArtistName] = useState<string | null>(null)
  const [editArtistInput, setEditArtistInput] = useState('')
  const [moodOpen, setMoodOpen] = useState(false)
  const moodMenuRef = useRef<HTMLDivElement>(null)
  const [smartOpen, setSmartOpen] = useState(false)
  const smartMenuRef = useRef<HTMLDivElement>(null)
  const [sortOpen, setSortOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConfigs()
    loadTracks()
  }, [loadConfigs, loadTracks])

  useEffect(() => {
    localStorage.setItem('library_viewMode', viewMode)
  }, [viewMode])
  useEffect(() => {
    localStorage.setItem('library_sortField', sortField)
  }, [sortField])
  useEffect(() => {
    localStorage.setItem('library_sortDir', sortDir)
  }, [sortDir])
  useEffect(() => {
    localStorage.setItem('library_filterConfig', filterConfig)
  }, [filterConfig])

  useEffect(() => {
    localStorage.setItem('library_search', search)
  }, [search])
  useEffect(() => {
    if (browseAlbum) localStorage.setItem('library_browseAlbum', browseAlbum)
    else localStorage.removeItem('library_browseAlbum')
  }, [browseAlbum])
  useEffect(() => {
    if (browseArtist) localStorage.setItem('library_browseArtist', browseArtist)
    else localStorage.removeItem('library_browseArtist')
  }, [browseArtist])
  useEffect(() => {
    if (browseFolder) localStorage.setItem('library_browseFolder', browseFolder)
    else localStorage.removeItem('library_browseFolder')
  }, [browseFolder])

  useEffect(() => {
    if (!artistMenu) return
    const handler = (): void => setArtistMenu(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [artistMenu])

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }, [sortField, sortDir])

  const handleSortFieldClick = (field: SortField): void => {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'playCount' || field === 'lastPlayed' || field === 'rating' ? 'desc' : 'asc')
    }
    setSortOpen(false)
  }

  const baseTracks = useMemo(() => {
    if (browseAlbum) return tracks.filter((t) => (t.album || UNKNOWN_ALBUM) === browseAlbum)
    if (browseArtist) return tracks.filter((t) => (t.artist || UNKNOWN_ARTIST) === browseArtist)
    return tracks
  }, [tracks, browseAlbum, browseArtist])

  const filtered = useMemo(() => {
    let result = baseTracks
    if (search) {
      const q = search.toLowerCase()
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q)
      )
    }
    if (filterConfig) {
      result = result.filter((t) => t.webdavId === filterConfig)
    }
    if (tagFilters.size > 0) {
      result = result.filter((t) => {
        const tags = aiTags.get(t.id)
        if (!tags) return false
        // 多选取并集：满足任一选中标签即可
        return Array.from(tagFilters).some((f) => tags.includes(f))
      })
    }
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'duration') {
        cmp = a.duration - b.duration
      } else if (sortField === 'playCount') {
        cmp = (a.playCount || 0) - (b.playCount || 0)
      } else if (sortField === 'rating') {
        cmp = (a.rating || 0) - (b.rating || 0)
      } else if (sortField === 'lastPlayed') {
        cmp = String(a.lastPlayed || '').localeCompare(String(b.lastPlayed || ''))
      } else {
        cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return result
  }, [baseTracks, search, filterConfig, sortField, sortDir, tagFilters, aiTags])

  // 全部已打标标签（按数量排序，取前 20 用于筛选）
  const allTags = useMemo(() => {
    const counter = new Map<string, number>()
    for (const tags of aiTags.values()) {
      for (const tag of tags) counter.set(tag, (counter.get(tag) || 0) + 1)
    }
    return Array.from(counter.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [aiTags])

  // AI 整库分类打标：分批调用，断点续跑（跳过已打标），可中断
  const classifyAll = async (): Promise<void> => {
    if (classifying) return
    const all = useMusicStore.getState().tracks
    const pending = all.filter((x) => !aiTags.has(x.id))
    if (pending.length === 0) {
      addToast(t('library.aiClassifyEmpty'), 'info')
      return
    }
    setClassifying(true)
    setClassifyProgress({ done: 0, total: pending.length })
    classifyCancelRef.current = false
    const tagMap = new Map(aiTags)
    const BATCH = 20
    let failed = false
    for (let i = 0; i < pending.length; i += BATCH) {
      if (classifyCancelRef.current) break
      const batch = pending.slice(i, i + BATCH)
      const prompt = batch
        .map((x, idx) => `${idx}. ${x.title || x.filename}${x.artist ? ` - ${x.artist}` : ''}${x.album ? ` [${x.album}]` : ''}`)
        .join('\n')
      const r = await window.api.ai.chat([{ role: 'user', content: prompt }], {
        system: '为下列每首歌曲生成 2-4 个中文标签（情绪/风格/场景，如：治愈、伤感、激昂、摇滚、民谣、跑步、学习、睡前、通勤）。根据歌名/歌手/专辑信息合理推断，不确定就给出常见风格标签。只输出严格 JSON 数组，不要任何其他文字：[{"index":0,"tags":["治愈","民谣"]},...]，index 对应输入行序号。',
        maxTokens: 1200,
        temperature: 0.3
      })
      if (!r.ok || !r.text) {
        addToast(t('ai.failed'), 'error')
        failed = true
        break
      }
      let parsed: { index: number; tags: unknown[] }[] = []
      try {
        let raw = r.text.trim()
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (fence) raw = fence[1].trim()
        const arr = JSON.parse(raw)
        parsed = Array.isArray(arr) ? arr : []
      } catch { /* ignore */ }
      const toSave: { trackId: number; tags: string[] }[] = []
      for (const item of parsed) {
        const track = batch[item.index]
        if (track && Array.isArray(item.tags) && item.tags.length > 0) {
          const tags = item.tags.map(String).filter(Boolean).slice(0, 8)
          if (tags.length > 0) {
            toSave.push({ trackId: track.id, tags })
            tagMap.set(track.id, tags)
          }
        }
      }
      if (toSave.length > 0) {
        await window.api.music.saveAiTags(toSave)
        setAiTags(new Map(tagMap))
      }
      setClassifyProgress({ done: Math.min(i + BATCH, pending.length), total: pending.length })
    }
    setClassifying(false)
    setClassifyProgress(null)
    if (!classifyCancelRef.current && !failed) {
      addToast(t('library.aiClassifyDone'), 'success')
    }
  }

  const albums = useMemo(() => {
    const map = new Map<string, { name: string; artist: string; tracks: MusicFile[] }>()
    for (const t of tracks) {
      const key = t.album || UNKNOWN_ALBUM
      const entry = map.get(key) || { name: key, artist: t.artist || '', tracks: [] }
      entry.tracks.push(t)
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [tracks])

  const artists = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>()
    for (const t of tracks) {
      const key = t.artist || UNKNOWN_ARTIST
      const entry = map.get(key) || { name: key, count: 0 }
      entry.count++
      map.set(key, entry)
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }, [tracks])

  // 歌手列表虚拟化
  const artistWin = useVirtualWindow(artists.length, 60)

  // 专辑网格虚拟化（列感知：JS 计算的列数/卡片宽度通过内联样式驱动 CSS grid，
  // 与布局完全一致，行高精确 = 封面 + 信息区 50 + 行间距，避免行高错位导致滚动卡住）
  const [albumGridNode, setAlbumGridNode] = useState<HTMLDivElement | null>(null)
  const albumGridRef = useCallback((el: HTMLDivElement | null): void => {
    setAlbumGridNode(el)
  }, [])
  const [albumScrollTop, setAlbumScrollTop] = useState(0)
  const [albumViewportH, setAlbumViewportH] = useState(0)
  const [albumGridW, setAlbumGridW] = useState(1100)
  useLayoutEffect(() => {
    if (!albumGridNode) return
    const scrollParent = albumGridNode.parentElement
    setAlbumScrollTop(0)
    const update = (): void => {
      setAlbumViewportH(scrollParent ? scrollParent.clientHeight : 0)
      setAlbumGridW(albumGridNode.clientWidth)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(albumGridNode)
    if (scrollParent) ro.observe(scrollParent)
    return () => ro.disconnect()
  }, [albumGridNode])

  const albumContentW = Math.max(0, albumGridW - ALBUM_GRID_PAD * 2)
  const albumCols = Math.max(1, Math.floor((albumContentW + ALBUM_GRID_GAP) / (150 + ALBUM_GRID_GAP)))
  const albumCardW = Math.min(200, Math.max(150, (albumContentW - (albumCols - 1) * ALBUM_GRID_GAP) / albumCols))
  const albumRowH = albumCardW + 50 + ALBUM_GRID_GAP
  const albumRowCount = Math.max(1, Math.ceil(albums.length / albumCols))
  const albumStartRow = Math.max(0, Math.floor(albumScrollTop / albumRowH) - 10)
  const albumEndRow = Math.min(albumRowCount, Math.ceil((albumScrollTop + albumViewportH) / albumRowH) + 10)
  const albumStart = albumStartRow * albumCols
  const albumEnd = Math.min(albums.length, albumEndRow * albumCols)
  const albumTopPad = albumStartRow * albumRowH
  const albumBottomPad = Math.max(0, (albumRowCount - albumEndRow) * albumRowH)
  // 内容收缩（窗口变高/曲库变小）时把滚动位置钳制回最大合法值，避免渲染空白
  const albumMaxScroll = Math.max(0, albumRowCount * albumRowH - albumViewportH)
  useEffect(() => {
    if (!albumGridNode) return
    const scrollParent = albumGridNode.parentElement
    if (!scrollParent) return
    if (scrollParent.scrollTop > albumMaxScroll) {
      scrollParent.scrollTop = albumMaxScroll
      setAlbumScrollTop(albumMaxScroll)
    }
  }, [albumMaxScroll, albumGridNode])

  const folderData = useMemo(() => {
    const subdirs = new Map<string, { label: string; key: string; count: number }>()
    const files: MusicFile[] = []
    const root = browseFolder || ''
    for (const t of tracks) {
      const segs = splitPath(t.path)
      if (segs.length === 0) continue
      segs.pop()
      const dirKey = segs.join('/')
      if (dirKey === root) {
        files.push(t)
      } else if (root === '' || dirKey.startsWith(root + '/')) {
        const rest = root === '' ? dirKey : dirKey.slice(root.length + 1)
        const child = rest.split('/')[0]
        if (child) {
          const childKey = root === '' ? child : root + '/' + child
          const existing = subdirs.get(childKey)
          if (existing) existing.count++
          else subdirs.set(childKey, { label: child, key: childKey, count: 1 })
        }
      }
    }
    return {
      subdirs: Array.from(subdirs.values()).sort((a, b) => a.label.localeCompare(b.label, 'zh')),
      files
    }
  }, [tracks, browseFolder])

  // 文件夹内文件按当前排序规则重排（MusicList 不自行排序）
  const sortedFolderFiles = useMemo(() => {
    return [...folderData.files].sort((a, b) => {
      let cmp = 0
      if (sortField === 'duration') {
        cmp = a.duration - b.duration
      } else if (sortField === 'playCount') {
        cmp = (a.playCount || 0) - (b.playCount || 0)
      } else if (sortField === 'rating') {
        cmp = (a.rating || 0) - (b.rating || 0)
      } else if (sortField === 'lastPlayed') {
        cmp = String(a.lastPlayed || '').localeCompare(String(b.lastPlayed || ''))
      } else {
        cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [folderData.files, sortField, sortDir])

  // 文件夹子目录虚拟化（固定行高 52px）
  const folderWin = useVirtualWindow(folderData.subdirs.length, 52)

  // 播放列表 = 唯一播放队列：从音乐库点歌，若在播放列表则定位，否则追加到播放列表并播放
  const handleRowClick = useCallback((track: MusicFile) => {
    usePlaylistStore.getState().playInPlaylist(track)
  }, [])

  const handleFolderRowClick = useCallback((track: MusicFile) => {
    usePlaylistStore.getState().playInPlaylist(track)
  }, [])

  const backToBrowse = useCallback(() => {
    setBrowseAlbum(null)
    setBrowseArtist(null)
    setBrowseFolder(null)
  }, [])

  const browsing = !!browseAlbum || !!browseArtist || !!browseFolder
  const parentFolder = browseFolder ? browseFolder.slice(0, browseFolder.lastIndexOf('/')) : null

  useEffect(() => {
    if (!moodOpen) return
    const handler = (e: MouseEvent): void => {
      if (moodMenuRef.current && !moodMenuRef.current.contains(e.target as Node)) setMoodOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [moodOpen])

  useEffect(() => {
    if (!smartOpen) return
    const handler = (e: MouseEvent): void => {
      if (smartMenuRef.current && !smartMenuRef.current.contains(e.target as Node)) setSmartOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [smartOpen])

  useEffect(() => {
    if (!sortOpen) return
    const handler = (e: MouseEvent): void => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [sortOpen])

  const playRandomAlbum = (): void => {
    if (albums.length === 0) return
    const album = albums[Math.floor(Math.random() * albums.length)]
    const albumTracks = album.tracks
    usePlayerStore.getState().setPlayMode('sequential')
    usePlayerStore.getState().playSelection(albumTracks)
  }

  const MOODS: { key: string; labelKey: string; descKey: string }[] = [
    { key: 'focus', labelKey: 'library.mood.focus', descKey: 'library.mood.focus.desc' },
    { key: 'relax', labelKey: 'library.mood.relax', descKey: 'library.mood.relax.desc' },
    { key: 'energetic', labelKey: 'library.mood.energetic', descKey: 'library.mood.energetic.desc' },
    { key: 'immersion', labelKey: 'library.mood.immersion', descKey: 'library.mood.immersion.desc' }
  ]

  // 心情电台：基于 AI 标签匹配（需要先对曲库执行 AI 分类）
  const MOOD_TAGS: Record<string, string[]> = {
    focus: ['学习', '专注', '工作', '安静'],
    relax: ['放松', '治愈', '舒缓', '温柔'],
    energetic: ['运动', '跑步', '激昂', '动感', '高能'],
    immersion: ['沉浸', '深夜', '民谣', '纯音乐', '氛围']
  }

  const playMood = (mood: string): void => {
    setMoodOpen(false)
    const wanted = MOOD_TAGS[mood] || []
    const pool = tracks.filter((t) => {
      const tags = aiTags.get(t.id)
      return !!tags && tags.some((tag) => wanted.includes(tag))
    })
    if (pool.length === 0) {
      useToastStore.getState().addToast(t('library.moodNoTags'), 'info')
      return
    }
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    usePlayerStore.getState().setPlayMode('shuffle')
    usePlayerStore.getState().playSelection(shuffled)
  }

  const SMART_LISTS: { key: string; labelKey: string; descKey: string }[] = [
    { key: 'recent_added', labelKey: 'library.smart.recent_added', descKey: 'library.smart.recent_added.desc' },
    { key: 'top_played', labelKey: 'library.smart.top_played', descKey: 'library.smart.top_played.desc' },
    { key: 'five_star', labelKey: 'library.smart.five_star', descKey: 'library.smart.five_star.desc' },
    { key: 'not_heard', labelKey: 'library.smart.not_heard', descKey: 'library.smart.not_heard.desc' },
    { key: 'hidden_gem', labelKey: 'library.smart.hidden_gem', descKey: 'library.smart.hidden_gem.desc' }
  ]

  const playSmartList = (rule: string): void => {
    setSmartOpen(false)
    const all = [...tracks]
    let list: MusicFile[]
    if (rule === 'recent_added') {
      list = all.sort((a, b) => String(b.scannedAt || '').localeCompare(String(a.scannedAt || ''))).slice(0, 50)
    } else if (rule === 'top_played') {
      list = all.sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 50)
    } else if (rule === 'five_star') {
      list = all.filter((t) => (t.rating || 0) === 5)
    } else if (rule === 'not_heard') {
      list = all.sort((a, b) => String(a.lastPlayed || '').localeCompare(String(b.lastPlayed || ''))).slice(0, 50)
    } else {
      list = all.filter((t) => (t.playCount || 0) === 0 && t.favorite === 0).sort(() => Math.random() - 0.5).slice(0, 50)
    }
    if (list.length === 0) {
      useToastStore.getState().addToast(t('library.smart.empty'), 'info')
      return
    }
    usePlayerStore.getState().setPlayMode('sequential')
    usePlayerStore.getState().playSelection(list)
  }

  const handleRenameArtist = async (): Promise<void> => {
    const oldName = editArtistName
    const newName = editArtistInput.trim()
    setEditArtistName(null)
    setArtistMenu(null)
    if (oldName === null || !newName || newName === oldName) return
    const targets = tracks
      .filter((t) => (oldName === UNKNOWN_ARTIST ? !t.artist : t.artist === oldName))
      .map((t) => t.id)
    if (targets.length > 0) {
      await useMusicStore.getState().updateMetaBatch(targets, { artist: newName })
    }
  }

  return (
    <div className="page library-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <h2>
          {browsing ? (
            <span className="browse-back" onClick={backToBrowse}>‹ {displayName(browseAlbum ?? browseArtist ?? browseFolder ?? '')}</span>
          ) : (
            t('nav.library')
          )}
        </h2>
        <div className="library-controls">
          <button
            className="btn btn-secondary add-all-btn"
            style={{ visibility: (search || filterConfig) && filtered.length > 0 ? 'visible' : 'hidden' }}
            onClick={() => setPickerTracks(filtered)}
            title={t('library.addAllTitle')}
          >
            {t('library.addAll')}
          </button>
          <div className="browse-tabs">
            <button className={`browse-tab${viewMode === 'songs' ? ' active' : ''}`} onClick={() => { setViewMode('songs'); backToBrowse() }}>{t('library.songs')}</button>
            <button className={`browse-tab${viewMode === 'albums' ? ' active' : ''}`} onClick={() => { setViewMode('albums'); backToBrowse() }}>{t('library.albums')}</button>
            <button className={`browse-tab${viewMode === 'artists' ? ' active' : ''}`} onClick={() => { setViewMode('artists'); backToBrowse() }}>{t('library.artists')}</button>
            <button className={`browse-tab${viewMode === 'folders' ? ' active' : ''}`} onClick={() => { setViewMode('folders'); backToBrowse() }}>{t('library.folders')}</button>
          </div>
          <button className="btn btn-sm" onClick={playRandomAlbum} title={t('library.randomAlbumTitle')}>{t('library.randomAlbum')}</button>
          <div className="mood-wrap" ref={moodMenuRef}>
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setMoodOpen((o) => !o) }}>{t('library.mood')}</button>
            {moodOpen && (
              <div className="mood-menu">
                {MOODS.map((m) => (
                  <div key={m.key} className="mood-item" onClick={() => playMood(m.key)}>
                    <span className="mood-name">{t(m.labelKey)}</span>
                    <span className="mood-desc">{t(m.descKey)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mood-wrap" ref={smartMenuRef}>
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setSmartOpen((o) => !o) }}>{t('library.smartList')}</button>
            {smartOpen && (
              <div className="mood-menu">
                {SMART_LISTS.map((m) => (
                  <div key={m.key} className="mood-item" onClick={() => playSmartList(m.key)}>
                    <span className="mood-name">{t(m.labelKey)}</span>
                    <span className="mood-desc">{t(m.descKey)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {classifying ? (
            <button className="btn btn-sm btn-primary" onClick={() => { classifyCancelRef.current = true }}>
              {t('library.aiClassifyRunning', classifyProgress ? { done: classifyProgress.done, total: classifyProgress.total } : undefined)}（{t('library.aiClassifyCancel')}）
            </button>
          ) : (
            <button className="btn btn-sm" onClick={classifyAll} title={t('library.aiClassifyTitle')}>
              ✨ {t('library.aiClassify')}
            </button>
          )}
          <input
            type="text"
            placeholder={t('library.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <select value={filterConfig} onChange={(e) => setFilterConfig(e.target.value)} className="filter-select">
            <option value="">{t('library.allSources')}</option>
            {configs.map((c) => (
              <option key={c.id} value={c.id}>{c.name || c.url}</option>
            ))}
          </select>
          <div className="mood-wrap" ref={sortMenuRef}>
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setSortOpen((o) => !o) }}>
              {t('library.sort')} ▾
            </button>
            {sortOpen && (
              <div className="mood-menu">
                {SORT_FIELDS.map((f) => (
                  <div key={f.field} className={`mood-item${sortField === f.field ? ' active' : ''}`} onClick={() => handleSortFieldClick(f.field)}>
                    <span className="mood-name">{t(f.labelKey)}</span>
                    {sortField === f.field && <span className="mood-desc">{sortDir === 'asc' ? t('library.sort.asc') : t('library.sort.desc')}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {allTags.length > 0 && tagsOpen && (
        <div className="tag-filter-bar">
          {allTags.map(([tag, count]) => {
            const active = tagFilters.has(tag)
            return (
              <button
                key={tag}
                className={`tag-chip${active ? ' active' : ''}`}
                onClick={() => {
                  setTagFilters((prev) => {
                    const next = new Set(prev)
                    if (next.has(tag)) next.delete(tag)
                    else next.add(tag)
                    return next
                  })
                }}
              >
                {tag} <span className="tag-count">{count}</span>
              </button>
            )
          })}
          {tagFilters.size > 0 && (
            <button className="tag-clear" onClick={() => setTagFilters(new Set())}>{t('library.tagFilterClear')}</button>
          )}
        </div>
      )}

      {viewMode === 'folders' ? (
        <div className="folder-view">
          {browseFolder && (
            <div className="folder-path" onClick={() => setBrowseFolder(parentFolder)}>
              <span className="folder-back-arrow">‹</span> {browseFolder}
            </div>
          )}
          {folderData.subdirs.length > 0 && (
            <div className="folder-subdirs" ref={folderWin.containerRef} onScroll={folderWin.onScroll}>
              {folderWin.topPad > 0 && <div style={{ height: folderWin.topPad }} />}
              {folderData.subdirs.slice(folderWin.start, folderWin.end).map((d) => (
                <div key={d.key} className="folder-row" onClick={() => { setBrowseFolder(d.key); setSearch('') }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                  </svg>
                  <span className="folder-name">{d.label}</span>
                  <span className="album-meta">{t('library.songCount', { count: d.count })}</span>
                </div>
              ))}
              {folderWin.bottomPad > 0 && <div style={{ height: folderWin.bottomPad }} />}
            </div>
          )}
          {folderData.files.length > 0 ? (
            <MusicList
              tracks={sortedFolderFiles}
              sortField={sortField}
              sortDir={sortDir}
              onSort={handleSort}
              onRowClick={handleFolderRowClick}
            />
          ) : folderData.subdirs.length === 0 ? (
            <div className="empty-state"><p>{t('library.emptyFolder')}</p></div>
          ) : null}
        </div>
      ) : viewMode === 'songs' || browsing ? (
        <MusicList
          tracks={filtered}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          onRowClick={handleRowClick}
          toolbarExtra={
            allTags.length > 0 ? (
              <button className="tag-toggle" onClick={() => setTagsOpen((o) => !o)}>
                <span>🏷️ {t('library.tagFilter')}</span>
                <span className="tag-toggle-arrow">{tagsOpen ? '▾' : '▸'}</span>
                {tagFilters.size > 0 && <span className="tag-toggle-count">{tagFilters.size}</span>}
              </button>
            ) : undefined
          }
        />
      ) : viewMode === 'albums' ? (
        <div className="browse-scroll" onScroll={(e) => setAlbumScrollTop(e.currentTarget.scrollTop)}>
          <div
            className="album-grid"
            ref={albumGridRef}
            style={{
              gridTemplateColumns: `repeat(${albumCols}, ${albumCardW}px)`,
              gap: ALBUM_GRID_GAP,
              padding: ALBUM_GRID_PAD,
              justifyContent: 'center'
            }}
          >
            {albumTopPad > 0 && <div style={{ height: albumTopPad, gridColumn: '1 / -1' }} />}
            {albums.slice(albumStart, albumEnd).map((a) => (
              <div key={a.name} className="album-card" onClick={() => { setBrowseAlbum(a.name); setSearch('') }}>
                <AlbumCover album={a.name} tracks={a.tracks} />
                <div className="album-card-info">
                  <span className="album-name">{displayName(a.name)}</span>
                  <span className="album-meta">{t('library.songCount', { count: a.tracks.length })}{a.artist ? ` · ${a.artist}` : ''}</span>
                </div>
              </div>
            ))}
            {albumBottomPad > 0 && <div style={{ height: albumBottomPad, gridColumn: '1 / -1' }} />}
          </div>
        </div>
      ) : (
        <div className="browse-scroll" ref={artistWin.containerRef} onScroll={artistWin.onScroll}>
          <div className="artist-list">
            {artistWin.topPad > 0 && <div style={{ height: artistWin.topPad }} />}
            {artists.slice(artistWin.start, artistWin.end).map((ar) => (
              <div
                key={ar.name}
                className="artist-row"
                onClick={() => { setBrowseArtist(ar.name); setSearch('') }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setArtistMenu({ x: e.clientX, y: e.clientY, name: ar.name })
                }}
              >
                <div className="artist-avatar">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                  </svg>
                </div>
                <span className="artist-name">{displayName(ar.name)}</span>
                <span className="album-meta">{t('library.songCount', { count: ar.count })}</span>
              </div>
            ))}
            {artistWin.bottomPad > 0 && <div style={{ height: artistWin.bottomPad }} />}
          </div>
        </div>
      )}

      {artistMenu && (
        <div
          className="context-menu"
          style={{ left: artistMenu.x, top: artistMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="context-menu-item"
            onClick={() => {
              setEditArtistName(artistMenu.name)
              setEditArtistInput(artistMenu.name === UNKNOWN_ARTIST ? '' : artistMenu.name)
              setArtistMenu(null)
            }}
          >
            {t('library.renameArtist')}
          </div>
        </div>
      )}

      {editArtistName !== null && (
        <Modal onClose={() => setEditArtistName(null)} width={360}>
          <h3>{t('library.renameArtist')}</h3>
          <div className="form-group">
            <label>{t('library.renameArtistLabel', { name: displayName(editArtistName) })}</label>
            <input
              type="text"
              value={editArtistInput}
              onChange={(e) => setEditArtistInput(e.target.value)}
              placeholder={t('library.newArtistName')}
              autoFocus
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setEditArtistName(null)}>{t('common.cancel')}</button>
            <button className="btn btn-primary" onClick={handleRenameArtist}>{t('common.save')}</button>
          </div>
        </Modal>
      )}

      {pickerTracks && (
        <PlaylistPickerModal tracks={pickerTracks} onClose={() => setPickerTracks(null)} />
      )}
    </div>
  )
}
