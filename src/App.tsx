import { FormEvent, useEffect, useMemo, useState } from 'react'

type Post = {
  id: string
  quote: string
  caption: string
  accent: string
  format: 'post' | 'reel'
  status: 'scheduled' | 'publishing' | 'published' | 'failed'
  scheduledFor: string
  mediaUrl?: string
  instagramMediaId?: string
  error?: string
}

type Dashboard = {
  account: { connected: boolean; username: string; accountType: string }
  publishingReady: boolean
  posts: Post[]
  settings: { autopilot: boolean; postTime: string; reelTime: string; timezone: string }
  stats: { scheduled: number; published: number; failed: number }
}

const accents = ['#d9ff3f', '#ff5c35', '#62e6ff', '#d8a7ff']
const initialDashboard: Dashboard = {
  account: { connected: false, username: 'silentforward', accountType: 'BUSINESS' },
  publishingReady: false,
  posts: [],
  settings: { autopilot: true, postTime: '09:00', reelTime: '19:00', timezone: 'Europe/Chisinau' },
  stats: { scheduled: 0, published: 0, failed: 0 },
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function App() {
  const [data, setData] = useState<Dashboard>(initialDashboard)
  const [quote, setQuote] = useState('Discipline is choosing what you want most over what you want now.')
  const [caption, setCaption] = useState('Save this for the day you need it most.\n\nQuiet work. Visible results. Follow @silentforward for a daily reset.\n\n#motivation #discipline #mindset #selfimprovement #dailyquotes #growthmindset #consistency #focus #personaldevelopment #silentforward')
  const [accent, setAccent] = useState(accents[0])
  const [format, setFormat] = useState<'post' | 'reel'>('post')
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + 86_400_000)
    d.setHours(9, 0, 0, 0)
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
  })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [previewPost, setPreviewPost] = useState<Post | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  async function refresh() {
    try {
      const response = await fetch('/api/dashboard')
      if (!response.ok) throw new Error('Server indisponibil')
      setData(await response.json())
    } catch { setNotice('Conexiunea cu serverul local nu este disponibilă.') }
  }

  useEffect(() => {
    refresh()
    const interval = window.setInterval(refresh, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const nextPost = useMemo(() => data.posts.find((post) => post.status === 'scheduled'), [data.posts])

  async function createPost(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch('/api/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote, caption, accent, format, scheduledFor: new Date(date).toISOString() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Postarea nu a putut fi creată.')
      setNotice('Postarea a fost adăugată în program.')
      await refresh()
    } catch (error) { setNotice(error instanceof Error ? error.message : 'A apărut o eroare.') }
    finally { setSaving(false) }
  }

  async function updateAutopilot(autopilot: boolean) {
    await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autopilot }) })
    await refresh()
  }

  async function updateTime(key: 'postTime' | 'reelTime', value: string) {
    setData((current) => ({ ...current, settings: { ...current.settings, [key]: value } }))
    await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: value }) })
    await refresh()
  }

  async function publishNow(id: string) {
    setNotice('Publicarea a început…')
    const response = await fetch(`/api/posts/${id}/publish`, { method: 'POST' })
    const result = await response.json()
    setNotice(response.ok ? 'Postarea a fost publicată.' : result.error)
    await refresh()
  }

  async function removePost(id: string) {
    const response = await fetch(`/api/posts/${id}`, { method: 'DELETE' })
    if (!response.ok) {
      const result = await response.json()
      setNotice(result.error || 'Postarea nu a putut fi ștearsă.')
      return
    }
    setNotice('Postarea a fost ștearsă din program.')
    await refresh()
  }

  async function openPreview(id: string) {
    setPreviewLoading(true)
    setPreviewPost(null)
    const response = await fetch(`/api/posts/${id}/preview`, { method: 'POST' })
    const result = await response.json()
    if (!response.ok) setNotice(result.error || 'Previzualizarea nu a putut fi generată.')
    else setPreviewPost(result)
    setPreviewLoading(false)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span>SF</span><strong>Silent Forward</strong></div>
        <nav><a className="active" href="#overview">Overview</a><a href="#studio">Content studio</a><a href="#schedule">Schedule</a></nav>
        <div className="account-card"><span className={`dot ${data.account.connected ? 'online' : ''}`} /><div><strong>@{data.account.username}</strong><small>{data.account.accountType}</small></div></div>
      </aside>
      <main>
        <header>
          <div><p className="eyebrow">CONTENT OPERATIONS</p><h1>Keep moving forward.</h1></div>
          <div className="header-actions">
            <div className="schedule-times"><label>Postare<input type="time" value={data.settings.postTime} onChange={(e) => updateTime('postTime', e.target.value)} /></label><label>Reel<input type="time" value={data.settings.reelTime} onChange={(e) => updateTime('reelTime', e.target.value)} /></label></div>
            <label className="switch-row"><span><strong>Autopilot</strong><small>1 postare + 1 Reel zilnic</small></span><input type="checkbox" checked={data.settings.autopilot} onChange={(e) => updateAutopilot(e.target.checked)} /></label>
          </div>
        </header>
        {!data.publishingReady && <section className="notice-card"><div><span className="notice-icon">!</span><strong>Previzualizarea este gata</strong></div><p>Pentru publicarea reală, aplicația mai are nevoie de un spațiu public temporar pentru imagini și videoclipuri. Programarea și generarea funcționează deja local.</p></section>}
        <section id="overview" className="metrics">
          <article><span>Programate</span><strong>{data.stats.scheduled}</strong><small>în coada curentă</small></article>
          <article><span>Publicate</span><strong>{data.stats.published}</strong><small>total postări</small></article>
          <article><span>Următoarea</span><strong className="metric-time">{nextPost ? formatDate(nextPost.scheduledFor) : '—'}</strong><small>{nextPost?.format === 'reel' ? 'Reel' : 'Postare'}</small></article>
        </section>
        <section id="studio" className="studio-grid">
          <div className="panel composer">
            <div className="section-heading"><div><p className="eyebrow">CREATE</p><h2>Content studio</h2></div><span className="badge">Minimal</span></div>
            <form onSubmit={createPost}>
              <label>Mesaj<textarea value={quote} onChange={(e) => setQuote(e.target.value)} maxLength={220} required /></label>
              <label>Descriere<textarea className="caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} /></label>
              <div className="form-row">
                <fieldset><legend>Culoare accent</legend><div className="colors">{accents.map((color) => <button type="button" key={color} aria-label={`Alege ${color}`} className={accent === color ? 'selected' : ''} style={{ background: color }} onClick={() => setAccent(color)} />)}</div></fieldset>
                <label>Format<select value={format} onChange={(e) => setFormat(e.target.value as 'post' | 'reel')}><option value="post">Postare 4:5</option><option value="reel">Reel 9:16</option></select></label>
              </div>
              <label>Data și ora<input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} required /></label>
              <button className="primary" disabled={saving}>{saving ? 'Se salvează…' : 'Programează postarea'}</button>
              {notice && <p className="form-notice">{notice}</p>}
            </form>
          </div>
          <div className="preview-column">
            <div className={`post-preview ${format}`}><span className="preview-mark">SILENT FORWARD</span><p>{quote}</p><span className="accent-line" style={{ background: accent }} /><small>@silentforward</small></div>
            <p className="preview-label">Previzualizare • {format === 'reel' ? '1080 × 1920' : '1080 × 1350'}</p>
          </div>
        </section>
        <section id="schedule" className="panel queue">
          <div className="section-heading"><div><p className="eyebrow">QUEUE</p><h2>Postări programate</h2></div><span className="badge">{data.posts.length} postări</span></div>
          <div className="table-wrap"><table><thead><tr><th>Conținut</th><th>Format</th><th>Programare</th><th>Status</th><th /></tr></thead><tbody>
            {data.posts.map((post) => <tr key={post.id}><td><span className="mini-accent" style={{ background: post.accent }} /><strong>{post.quote}</strong></td><td>{post.format === 'reel' ? 'Reel' : 'Postare'}</td><td>{formatDate(post.scheduledFor)}</td><td><span className={`status ${post.status}`}>{post.status}</span></td><td><div className="row-actions"><button className="text-button muted" onClick={() => openPreview(post.id)}>Previzualizează</button>{['scheduled', 'failed'].includes(post.status) && <button className="text-button" onClick={() => publishNow(post.id)}>Publică acum</button>}<button className="text-button muted" onClick={() => removePost(post.id)}>Șterge</button></div></td></tr>)}
            {!data.posts.length && <tr><td colSpan={5} className="empty">Nu există încă postări programate.</td></tr>}
          </tbody></table></div>
        </section>
      </main>
      {(previewLoading || previewPost) && <div className="modal-backdrop" role="presentation" onMouseDown={() => !previewLoading && setPreviewPost(null)}><section className="preview-modal" role="dialog" aria-modal="true" aria-label="Previzualizare postare" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" aria-label="Închide" onClick={() => setPreviewPost(null)}>×</button>{previewLoading ? <div className="preview-loading">Se generează previzualizarea…</div> : previewPost && <><div className="media-frame">{previewPost.format === 'reel' ? <video src={previewPost.mediaUrl} controls autoPlay loop /> : <img src={previewPost.mediaUrl} alt={previewPost.quote} />}</div><div className="preview-copy"><span className="badge">{previewPost.format === 'reel' ? 'Reel • fade 1s • ambient original' : 'Postare 4:5'}</span><h2>{previewPost.quote}</h2><p>{previewPost.caption}</p></div></>}</section></div>}
    </div>
  )
}

export default App
