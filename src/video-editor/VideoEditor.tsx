import { useEffect, useState } from 'react';
import { useEditor } from './useEditor';
import { useMedia } from './media';
import { newProject } from './model';
import { clearMedia } from './storage';
import { Icon } from './Icon';
import { MediaLibrary } from './MediaLibrary';
import { VideoPreview } from './VideoPreview';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { ExportModal } from './ExportModal';
import './editor.css';

export default function VideoEditor() {
  const editor = useEditor(),
    media = useMedia(editor.project.assets, editor.setError);
  const [exporting, setExporting] = useState(false),
    [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(
      ['Studio Sans', 'Studio Serif', 'Studio Mono'].map((font) =>
        document.fonts.load(`700 80px "${font}"`),
      ),
    )
      .then(() => {
        if (alive) setFontsReady(true);
      })
      .catch(() => {
        if (alive) {
          setFontsReady(true);
          editor.setError('Some bundled fonts could not load. Reload before exporting text.');
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!editor.ready || !fontsReady)
    return (
      <div className="ve-loading">
        <span className="ve-brand-mark">SF</span>
        <p>Opening your editing room…</p>
      </div>
    );
  return (
    <div className="ve-app">
      <header className="ve-header">
        <a
          className="ve-back"
          href="/"
          title="Back to Silent Forward"
          aria-label="Back to Silent Forward"
          onClick={(event) => {
            event.preventDefault();
            void editor.persist(editor.project).then((saved) => {
              if (saved) window.location.href = '/';
            });
          }}
        >
          <Icon name="back" size={16} />
        </a>
        <div className="ve-brand" aria-label="Silent Forward Video Editor">
          <span className="ve-brand-mark">SF</span>
          <span>
            Silent Forward<small>VIDEO EDITOR</small>
          </span>
        </div>
        <i className="ve-divider" />
        <div className="ve-project-title">
          <input
            aria-label="Project name"
            value={editor.project.name}
            maxLength={80}
            onFocus={editor.begin}
            onBlur={editor.end}
            onChange={(event) => editor.edit((p) => ({ ...p, name: event.target.value }))}
          />
          <span className={editor.saved === 'Saved locally' ? 've-saved' : ''}>
            <i />
            {editor.saved}
          </span>
        </div>
        <div className="ve-header-actions">
          <button
            title="New project"
            className="ve-new"
            onClick={async () => {
              if (!confirm('Start a new project? Current media and undo history will be cleared.'))
                return;
              editor.setPlaying(false);
              const project = newProject();
              editor.edit(() => project);
              if (await editor.persist(project)) {
                try {
                  await clearMedia();
                  window.location.reload();
                } catch {
                  editor.setError('Could not clear local media. Reload and try again.');
                }
              }
            }}
          >
            <Icon name="plus" />
            New
          </button>
          <button
            title="Save project · ⌘/Ctrl S"
            aria-label="Save project"
            onClick={() => void editor.persist(editor.project)}
          >
            <Icon name="save" />
          </button>
          <i className="ve-divider" />
          <button
            title="Undo · ⌘/Ctrl Z"
            aria-label="Undo"
            disabled={!editor.canUndo}
            onClick={() => editor.undo()}
          >
            <Icon name="undo" />
          </button>
          <button
            title="Redo · ⌘/Ctrl Shift Z"
            aria-label="Redo"
            disabled={!editor.canRedo}
            onClick={() => editor.undo(true)}
          >
            <Icon name="redo" />
          </button>
          <button
            className="ve-primary"
            disabled={!editor.project.clips.length}
            onClick={() => {
              editor.setPlaying(false);
              setExporting(true);
            }}
          >
            <Icon name="export" />
            Export<span>↗</span>
          </button>
        </div>
      </header>
      {editor.error && (
        <div className="ve-notice" role="alert">
          <span>{editor.error}</span>
          <button aria-label="Dismiss message" onClick={() => editor.setError('')}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      <main className="ve-workspace" inert={exporting || undefined}>
        <MediaLibrary editor={editor} />
        <VideoPreview editor={editor} media={media.resources} mediaRevision={media.revision} />
        <Inspector editor={editor} />
      </main>
      <div inert={exporting || undefined}>
        <Timeline editor={editor} />
      </div>
      {exporting && <ExportModal project={editor.project} onClose={() => setExporting(false)} />}
    </div>
  );
}
