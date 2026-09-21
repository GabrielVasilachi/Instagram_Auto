import { useEffect, useRef, useState } from 'react';
import { dimensions, durationOf } from './model';
import type { ExportResult, ExportSettings, Project } from './types';
import { exportProject, sendToPlanner } from './export';
import { Icon } from './Icon';

export function ExportModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const [settings, setSettings] = useState<ExportSettings>({
      resolution: 1080,
      fps: project.fps,
      quality: 'high',
    }),
    [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(''),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [result, setResult] = useState<ExportResult | null>(null);
  const [planner, setPlanner] = useState(false),
    [caption, setCaption] = useState(''),
    [scheduled, setScheduled] = useState(''),
    [sent, setSent] = useState(false),
    [sending, setSending] = useState(false);
  const [capability, setCapability] = useState<{ available: boolean; cloud: boolean } | null>(null);
  const controller = useRef<AbortController | null>(null),
    dialog = useRef<HTMLDivElement>(null),
    download = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    dialog.current?.focus();
    fetch('/api/video-editor/capabilities')
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            'Could not check export availability. Sign in again if your session expired.',
          );
        setCapability(await r.json());
      })
      .catch((e) => setError(e.message));
    return () => {
      controller.current?.abort();
      previous?.focus();
    };
  }, []);
  async function start() {
    setBusy(true);
    setError('');
    setResult(null);
    setPhase('Preparing project');
    setProgress(0);
    controller.current = new AbortController();
    try {
      setResult(
        await exportProject(project, settings, controller.current.signal, (label, value) => {
          setPhase(label);
          setProgress(Math.round(value));
        }),
      );
    } catch (reason) {
      setError(
        controller.current.signal.aborted
          ? 'Export cancelled. Your project is still saved.'
          : reason instanceof Error
            ? reason.message
            : 'Export failed.',
      );
    } finally {
      setBusy(false);
    }
  }
  const size = dimensions(project.ratio, settings.resolution),
    reel = project.ratio === '9:16' && durationOf(project) >= 3;
  return (
    <div
      className="ve-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy && !sending) onClose();
      }}
    >
      <div
        className="ve-export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ve-export-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy && !sending) onClose();
          if (event.key === 'Tab') {
            const controls = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input, textarea, select:not(:disabled), a[href]',
              ),
            ).filter((el) => !el.hidden);
            const first = controls[0],
              last = controls.at(-1);
            if (
              event.shiftKey &&
              (document.activeElement === first || document.activeElement === event.currentTarget)
            ) {
              event.preventDefault();
              last?.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
          event.stopPropagation();
        }}
      >
        <header>
          <div className="ve-export-symbol">
            <Icon name={result ? 'check' : 'export'} size={24} />
          </div>
          <div>
            <small>SILENT FORWARD</small>
            <h2 id="ve-export-title">{result ? 'Ready for the world.' : 'Export your story.'}</h2>
          </div>
          <button aria-label="Close export" disabled={busy || sending} onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        {!result && (
          <>
            <p>A real MP4, ready for your next move.</p>
            <div className="ve-export-summary">
              <div style={{ aspectRatio: project.ratio.replace(':', '/') }}>
                <Icon name="video" size={26} />
              </div>
              <span>
                <strong>{project.name}</strong>
                <small>
                  {size.width} × {size.height} · {durationOf(project).toFixed(1)}s ·{' '}
                  {project.clips.length} clips
                </small>
              </span>
              <b>MP4</b>
            </div>
            <fieldset disabled={busy} className="ve-export-options">
              <label>
                Resolution
                <select
                  aria-label="Resolution"
                  value={settings.resolution}
                  onChange={(event) =>
                    setSettings((s) => ({
                      ...s,
                      resolution: Number(event.target.value) as 720 | 1080,
                    }))
                  }
                >
                  <option value={720}>720p · HD</option>
                  <option value={1080}>1080p · Full HD</option>
                </select>
              </label>
              <label>
                Frame rate
                <select
                  aria-label="Frame rate"
                  value={settings.fps}
                  onChange={(event) =>
                    setSettings((s) => ({ ...s, fps: Number(event.target.value) as 24 | 30 | 60 }))
                  }
                >
                  {[24, 30, 60].map((fps) => (
                    <option key={fps} value={fps}>
                      {fps} FPS
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quality
                <select
                  aria-label="Quality"
                  value={settings.quality}
                  onChange={(event) =>
                    setSettings((s) => ({
                      ...s,
                      quality: event.target.value as ExportSettings['quality'],
                    }))
                  }
                >
                  <option value="standard">Standard · smaller file</option>
                  <option value="high">High · sharper details</option>
                </select>
              </label>
              <label>
                Format<div className="ve-static-input">MP4 · H.264 + AAC</div>
              </label>
            </fieldset>
            {capability?.available === false && (
              <p className="ve-error">
                Export requires Cloudinary to be configured on this server.
              </p>
            )}
            <p className="ve-muted">
              {capability?.cloud
                ? 'Media is uploaded to your Cloudinary account for rendering. Keep this page open until the video is ready.'
                : 'Keep this page open while your video renders.'}{' '}
              Larger projects may need 720p to finish within the server time limit.
            </p>
          </>
        )}
        {busy && (
          <div className="ve-export-progress" aria-live="polite">
            <span>
              {phase}
              <strong>{progress}%</strong>
            </span>
            <progress max={100} value={progress} />
          </div>
        )}
        {result && (
          <>
            <video className="ve-result-video" src={result.url} controls playsInline />
            <div className="ve-export-actions">
              <button
                className="ve-primary"
                onClick={async () => {
                  setError('');
                  try {
                    setSending(true);
                    const response = await fetch(result.url);
                    if (!response.ok) throw new Error('Download failed.');
                    const url = URL.createObjectURL(await response.blob());
                    const a = download.current!;
                    a.href = url;
                    a.download = `${project.name.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80)}.mp4`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 30_000);
                  } catch {
                    window.open(result.url, '_blank', 'noopener');
                    setError('Use Save video in the opened tab to download your MP4.');
                  } finally {
                    setSending(false);
                  }
                }}
                disabled={sending}
              >
                <Icon name="export" />
                Download video
              </button>
              <a ref={download} hidden />
              <button
                className="ve-secondary"
                disabled={!reel || !capability?.cloud || sent}
                onClick={() => setPlanner((v) => !v)}
              >
                Send to Instagram Planner
              </button>
            </div>
            {!reel && (
              <p className="ve-muted">
                To schedule a Reel, use a 9:16 canvas with at least 3 seconds.
              </p>
            )}
            {!capability?.cloud && (
              <p className="ve-muted">
                Planner delivery is available when Cloudinary is configured.
              </p>
            )}
            {planner && !sent && (
              <form
                className="ve-planner-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setSending(true);
                  setError('');
                  try {
                    await sendToPlanner(
                      result,
                      project.name,
                      caption,
                      new Date(scheduled).toISOString(),
                    );
                    setSent(true);
                  } catch (reason) {
                    setError(
                      reason instanceof Error ? reason.message : 'Could not schedule the Reel.',
                    );
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <label>
                  Instagram caption
                  <textarea
                    maxLength={2200}
                    value={caption}
                    onChange={(event) => setCaption(event.target.value)}
                    rows={3}
                  />
                </label>
                <label>
                  Schedule · {Intl.DateTimeFormat().resolvedOptions().timeZone}
                  <input
                    type="datetime-local"
                    required
                    value={scheduled}
                    onChange={(event) => setScheduled(event.target.value)}
                  />
                </label>
                <button className="ve-primary" disabled={sending}>
                  {sending ? 'Adding to planner…' : 'Schedule Reel'}
                </button>
                <p className="ve-muted">
                  The existing publishing worker will publish this video at the selected time.
                </p>
              </form>
            )}
            {sent && (
              <p className="ve-success">
                Reel scheduled. <a href="/#planner">Open Instagram Planner →</a>
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="ve-error">
            {error}
          </p>
        )}
        <footer>
          <span>
            {result ? 'Made with Silent Forward.' : 'Your original files stay untouched.'}
          </span>
          {busy ? (
            <button className="ve-secondary" onClick={() => controller.current?.abort()}>
              Cancel export
            </button>
          ) : !result ? (
            <button
              className="ve-primary"
              disabled={!capability?.available || !project.clips.length}
              onClick={start}
            >
              <Icon name="export" />
              Export video
            </button>
          ) : (
            <button className="ve-secondary" disabled={sending} onClick={onClose}>
              Done
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
