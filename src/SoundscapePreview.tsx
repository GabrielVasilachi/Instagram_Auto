import { useEffect, useRef, useState } from 'react'

export function SoundscapePreview({ music, volume }: { music: string; volume: number }) {
  // Remount on selection changes to stop the old sample and reset playback/errors.
  return <Sample key={music} music={music} volume={volume} />
}

function Sample({ music, volume }: { music: string; volume: number }) {
  const audio = useRef<HTMLAudioElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (audio.current) audio.current.volume = Math.min(1, Math.max(0, volume / 100))
  }, [volume, attempt])
  useEffect(() => {
    const player = audio.current
    return () => { player?.pause() }
  }, [attempt])
  if (music === 'silent') return <p className="settings-note">Fără muzică — opțiunea „silent” nu conține audio.</p>
  return <div className="soundscape-preview">
    <span>Ascultă {music} · 8 secunde</span>
    <audio key={attempt} ref={audio} controls preload="none" aria-label={`Ascultă soundscape ${music}`}
      src={`/api/soundscapes/${encodeURIComponent(music)}/preview?v=1&attempt=${attempt}`}
      onLoadStart={() => setError(false)} onWaiting={() => setLoading(true)}
      onCanPlay={() => setLoading(false)} onPlaying={() => setLoading(false)}
      onError={() => { setLoading(false); setError(true) }} />
    {loading && !error && <small role="status">Se încarcă mostra audio…</small>}
    {volume === 0 && <small>Volumul este 0%. Mărește-l pentru a auzi mostra.</small>}
    {error && <div role="alert"><small>Mostra nu a putut fi încărcată.</small> <button type="button" onClick={() => { setError(false); setAttempt(a => a + 1) }}>Reîncearcă</button></div>}
  </div>
}
