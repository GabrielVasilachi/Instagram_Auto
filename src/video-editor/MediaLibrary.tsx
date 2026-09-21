import { useRef, useState } from 'react';
import { durationOf, mediaClip, templateProject, textClip, timeLabel } from './model';
import { inspectMedia, MAX_MEDIA_BYTES } from './media';
import type { Editor } from './useEditor';
import type { MediaAsset, TextClip } from './types';
import { getMedia, saveMedia } from './storage';
import { Icon } from './Icon';

export function MediaLibrary({ editor: e }: { editor: Editor }) {
  const [tab, setTab] = useState('media'),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(''),
    [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    relink = useRef<HTMLInputElement>(null),
    relinkId = useRef<string>('');
  async function importFiles(files: FileList | File[]) {
    if (busy) return;
    setBusy(true);
    let total = e.project.assets.reduce((s, a) => s + a.size, 0),
      count = e.project.assets.length;
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        if (total + file.size > MAX_MEDIA_BYTES || count >= 30)
          throw new Error(
            'Project media limit: 250 MB / 30 files. Start a new project to import more.',
          );
        const asset = await inspectMedia(file);
        total += file.size;
        count++;
        e.edit((p) => ({ ...p, assets: [...p.assets, asset] }));
      } catch (reason) {
        failures.push(reason instanceof Error ? reason.message : `Cannot import ${file.name}`);
      }
    }
    setBusy(false);
    if (failures.length) e.setError(failures.join(' '));
  }
  function addAsset(asset: MediaAsset) {
    if (e.project.clips.length >= 40) return e.setError('A project can contain up to 40 clips.');
    const track = asset.kind === 'audio' ? 'audio' : 'video';
    if (e.project.tracks.find((t) => t.id === track)?.locked)
      return e.setError('Unlock the track before adding media.');
    const end = Math.max(
        0,
        ...e.project.clips.filter((c) => c.track === track).map((c) => c.start + c.duration),
      ),
      start = asset.kind === 'audio' ? e.time : end;
    if (start >= 180) return e.setError('Maximum project duration is 3 minutes.');
    const clip = mediaClip(asset, start);
    clip.duration = Math.min(clip.duration, 180 - start);
    e.edit((p) => ({ ...p, clips: [...p.clips, clip] }));
    e.setSelected(clip.id);
    e.seek(start);
  }
  function addText(style?: Partial<TextClip['text']>) {
    if (e.project.clips.length >= 40 || e.project.tracks.find((t) => t.id === 'text')?.locked)
      return;
    const clip = textClip(Math.min(e.time, 175));
    clip.text = { ...clip.text, ...style };
    e.edit((p) => ({ ...p, clips: [...p.clips, clip] }));
    e.setSelected(clip.id);
  }
  const filtered = e.project.assets.filter(
    (a) =>
      (tab !== 'audio' || a.kind === 'audio') &&
      a.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <aside className="ve-library">
      <div className="ve-library-tabs" role="tablist" aria-label="Editor tools">
        {[
          ['media', 'folder', 'Media'],
          ['audio', 'audio', 'Audio'],
          ['text', 'text', 'Text'],
          ['effects', 'effects', 'Effects'],
          ['templates', 'templates', 'Templates'],
        ].map(([key, icon, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={tab === key ? 've-active' : ''}
          >
            <Icon name={icon} size={19} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div
        className="ve-library-body"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
        }}
      >
        <div className="ve-panel-heading">
          <span>{tab === 'media' ? 'Project media' : tab[0].toUpperCase() + tab.slice(1)}</span>
          <small>
            {['media', 'audio'].includes(tab) ? `${filtered.length} assets` : 'CREATIVE TOOLS'}
          </small>
        </div>
        {['media', 'audio'].includes(tab) && (
          <>
            <input
              hidden
              ref={input}
              type="file"
              accept=".mp4,.mov,.webm,.png,.jpg,.jpeg,.webp,.mp3,.wav,.aac,.m4a"
              multiple
              onChange={(event) => {
                if (event.target.files) void importFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <button
              className="ve-import-button"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              <Icon name="import" />
              {busy ? 'Importing media…' : 'Import media'}
            </button>
            <input
              className="ve-search"
              type="search"
              placeholder="Search project media"
              aria-label="Search media"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className={`ve-media-grid ${dragging ? 've-drop-active' : ''}`}>
              {filtered.map((asset) => (
                <article
                  key={asset.id}
                  className="ve-media-item"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-sf-media', asset.id);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onDoubleClick={() => addAsset(asset)}
                >
                  <div className="ve-media-thumb">
                    {asset.thumbnail ? (
                      <img src={asset.thumbnail} alt="" />
                    ) : (
                      <Icon name="audio" size={27} />
                    )}
                    <span>{asset.kind === 'image' ? 'IMAGE' : timeLabel(asset.duration)}</span>
                    <button
                      aria-label={`Add ${asset.name} to timeline`}
                      title="Add to timeline"
                      onClick={() => addAsset(asset)}
                    >
                      <Icon name="plus" size={16} />
                    </button>
                  </div>
                  <strong title={asset.name}>{asset.name}</strong>
                  <small>
                    {asset.width ? `${asset.width} × ${asset.height}` : asset.mime || 'Audio'}
                    <button
                      className="ve-relink"
                      title="Restore a missing local file"
                      onClick={async () => {
                        if (await getMedia(asset.id)) {
                          e.setError('This media file is already available locally.');
                          return;
                        }
                        relinkId.current = asset.id;
                        relink.current?.click();
                      }}
                    >
                      Relink
                    </button>
                  </small>
                </article>
              ))}
            </div>
            {!filtered.length && (
              <button className="ve-import-empty" onClick={() => input.current?.click()}>
                <div>
                  <Icon name={tab === 'audio' ? 'audio' : 'import'} size={26} />
                </div>
                <strong>{tab === 'audio' ? 'Set the mood.' : 'Your story starts here.'}</strong>
                <span>
                  Drag your {tab === 'audio' ? 'music' : 'files'} here
                  <br />
                  or click to browse
                </span>
                <small>
                  {tab === 'audio' ? 'MP3 · WAV · AAC' : 'MP4 · MOV · WebM · Images · Audio'}
                </small>
              </button>
            )}
            <p className="ve-library-footnote">
              Files stay on this device until export.
              <br />
              Double-click or drag media to the timeline.
            </p>
            <input
              hidden
              ref={relink}
              type="file"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const original = e.project.assets.find((a) => a.id === relinkId.current);
                  if (!original || original.size !== file.size || original.name !== file.name)
                    throw new Error('Choose the original file with the same name and size.');
                  await saveMedia(original.id, file);
                  e.edit((p) => ({ ...p, assets: [...p.assets] }));
                } catch (error) {
                  e.setError(String(error));
                }
                event.target.value = '';
              }}
            />
          </>
        )}
        {tab === 'text' && (
          <div className="ve-presets">
            <button className="ve-import-button" onClick={() => addText()}>
              <Icon name="plus" />
              Add text
            </button>
            <p>Titles, thoughts, and words that stay.</p>
            <button
              className="ve-text-preset"
              onClick={() =>
                addText({ content: 'MAKE IT\nMEAN SOMETHING.', weight: 800, size: 92 })
              }
            >
              <b>
                MAKE IT
                <br />
                MEAN SOMETHING.
              </b>
              <span>Bold statement</span>
            </button>
            <button
              className="ve-text-preset ve-serif"
              onClick={() =>
                addText({
                  content: 'A quieter kind\nof ambition.',
                  font: 'serif',
                  size: 80,
                  weight: 500,
                })
              }
            >
              A quieter kind
              <br />
              of ambition.<span>Editorial serif</span>
            </button>
            <button
              className="ve-text-preset ve-accent-text"
              onClick={() =>
                addText({
                  content: 'SILENT PROGRESS.',
                  color: '#d9ff3f',
                  size: 72,
                  animation: 'fade',
                })
              }
            >
              SILENT PROGRESS.<span>Silent Forward signature</span>
            </button>
            <button
              className="ve-text-preset ve-caption"
              onClick={() =>
                addText({ content: 'Every small step counts.', size: 58, backgroundOpacity: 0.75 })
              }
            >
              Every small step counts.<span>Caption</span>
            </button>
          </div>
        )}
        {tab === 'effects' && (
          <div className="ve-presets">
            <p>Apply a look to the selected video or image. Fine-tune it in Properties.</p>
            {[
              ['Original', 1, 1, 1, 0],
              ['Cinema', 0.95, 1.22, 0.72, 0],
              ['Monochrome', 1, 1.18, 1, 1],
              ['Vivid', 1.08, 1.1, 1.4, 0],
              ['Soft light', 1.12, 0.85, 0.85, 0],
            ].map(([name, brightness, contrast, saturation, grayscale]) => (
              <button
                className="ve-look"
                key={name}
                disabled={
                  !e.project.clips.some(
                    (c) => c.id === e.selected && (c.kind === 'video' || c.kind === 'image'),
                  )
                }
                onClick={() =>
                  e.selected &&
                  e.updateClip(e.selected, (c) => ({
                    ...c,
                    adjustments: {
                      brightness: Number(brightness),
                      contrast: Number(contrast),
                      saturation: Number(saturation),
                      grayscale: Number(grayscale),
                      exposure: 0,
                      blur: 0,
                    },
                  }))
                }
              >
                <span
                  style={{
                    filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation}) grayscale(${grayscale})`,
                  }}
                />
                <strong>{name}</strong>
                <Icon name="plus" size={14} />
              </button>
            ))}
          </div>
        )}
        {tab === 'templates' && (
          <div className="ve-presets">
            <p>A starting point for your next story.</p>
            {[
              'Blank project',
              'Instagram Reel',
              'Motivational Reel',
              'Quote Reel',
              'Cinematic Reel',
            ].map((name, i) => (
              <button
                className="ve-template"
                key={name}
                onClick={() => {
                  if (
                    durationOf(e.project) &&
                    !confirm(
                      'Replace the current timeline with this template? You can undo this change.',
                    )
                  )
                    return;
                  const p = templateProject(name);
                  e.edit((current) => ({ ...p, assets: current.assets }));
                  e.seek(0);
                  e.setSelected(null);
                  e.setPlaying(false);
                }}
              >
                <span>0{i + 1}</span>
                <div>
                  <strong>{name}</strong>
                  <small>
                    {name === 'Cinematic Reel' ? '16:9 · Editorial' : '9:16 · Vertical'}
                  </small>
                </div>
                <Icon name="chevron" size={14} />
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
