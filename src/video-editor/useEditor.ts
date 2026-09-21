import { useCallback, useEffect, useRef, useState } from 'react';
import { newProject, durationOf, clamp, splitClip, uid } from './model';
import { loadProject, saveProject } from './storage';
import type { Clip, Project } from './types';

export function useEditor() {
  const [project, setProject] = useState<Project>(newProject);
  const [ready, setReady] = useState(false),
    [saved, setSaved] = useState('Loading project…'),
    [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0);
  const current = useRef(project),
    clock = useRef(0),
    history = useRef<{ past: Project[]; future: Project[] }>({ past: [], future: [] });
  const gesture = useRef<Project | null>(null),
    saveQueue = useRef(Promise.resolve()),
    saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    loadProject()
      .then((p) => {
        if (!alive) return;
        if (
          p?.version === 1 &&
          Array.isArray(p.clips) &&
          Array.isArray(p.assets) &&
          Array.isArray(p.tracks)
        ) {
          current.current = p;
          setProject(p);
        }
        setReady(true);
        setSaved('Saved locally');
      })
      .catch(() => {
        if (alive) {
          setReady(true);
          setError('Local recovery is unavailable. Allow browser storage before importing media.');
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  const persist = useCallback((p: Project) => {
    setSaved('Saving…');
    const job = saveQueue.current
      .catch(() => {})
      .then(() => saveProject(p))
      .then(() => {
        if (current.current === p) setSaved('Saved locally');
      });
    saveQueue.current = job.catch(() => {
      setSaved('Save failed');
      setError('Could not save the project. Your browser storage may be full.');
    });
    return job.then(
      () => true,
      () => false,
    );
  }, []);
  useEffect(() => {
    if (!ready) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(project);
    }, 350);
    return () => clearTimeout(saveTimer.current);
  }, [project, ready, persist]);
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'hidden' && ready) {
        clearTimeout(saveTimer.current);
        void persist(current.current);
      }
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (saved !== 'Saved locally') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('beforeunload', unload);
    return () => {
      document.removeEventListener('visibilitychange', flush);
      window.removeEventListener('beforeunload', unload);
    };
  }, [ready, saved, persist]);
  const edit = useCallback((fn: (p: Project) => Project, transient = false) => {
    const before = current.current,
      next = fn(before);
    if (before === next) return;
    if (!transient && !gesture.current) {
      history.current.past = [...history.current.past.slice(-79), before];
      history.current.future = [];
    }
    current.current = next;
    setSaved('Unsaved changes');
    setProject(next);
    setRevision((r) => r + 1);
  }, []);
  const begin = useCallback(() => {
    if (!gesture.current) gesture.current = current.current;
  }, []);
  const end = useCallback(() => {
    if (gesture.current && gesture.current !== current.current) {
      history.current.past = [...history.current.past.slice(-79), gesture.current];
      history.current.future = [];
    }
    gesture.current = null;
    setRevision((r) => r + 1);
  }, []);
  const seek = useCallback((t: number) => {
    clock.current = clamp(t, 0, durationOf(current.current));
    setTime(clock.current);
  }, []);
  const undo = useCallback((redo = false) => {
    const h = history.current,
      source = redo ? h.future : h.past,
      target = redo ? h.past : h.future,
      next = source.pop();
    if (!next) return;
    target.push(current.current);
    current.current = next;
    setSaved('Unsaved changes');
    setProject(next);
    setRevision((r) => r + 1);
    setPlaying(false);
  }, []);
  const updateClip = useCallback(
    (id: string, fn: (c: Clip) => Clip) =>
      edit((p) => ({
        ...p,
        clips: p.clips.map((c) =>
          c.id === id && !p.tracks.find((t) => t.id === c.track)?.locked ? fn(c) : c,
        ),
      })),
    [edit],
  );
  const remove = useCallback(() => {
    if (selected)
      edit((p) => ({
        ...p,
        clips: p.clips.filter(
          (c) => c.id !== selected || p.tracks.find((t) => t.id === c.track)?.locked,
        ),
      }));
  }, [selected, edit]);
  const duplicate = useCallback(() => {
    edit((p) => {
      const c = p.clips.find((c) => c.id === selected);
      return !c ||
        p.clips.length >= 40 ||
        p.tracks.find((t) => t.id === c.track)?.locked ||
        c.start + c.duration * 2 > 180
        ? p
        : {
            ...p,
            clips: [...p.clips, { ...structuredClone(c), id: uid(), start: c.start + c.duration }],
          };
    });
  }, [edit, selected]);
  const split = useCallback(() => {
    if (selected) edit((p) => splitClip(p, selected, clock.current));
  }, [selected, edit]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = performance.now(),
      lastUI = last;
    const tick = (now: number) => {
      clock.current = Math.min(durationOf(current.current), clock.current + (now - last) / 1000);
      last = now;
      if (now - lastUI > 32) {
        setTime(clock.current);
        lastUI = now;
      }
      if (clock.current >= durationOf(current.current)) {
        setTime(clock.current);
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => {
    if (clock.current > durationOf(project)) seek(durationOf(project));
  }, [project, seek]);
  const togglePlay = useCallback(() => {
    if (clock.current >= durationOf(current.current)) seek(0);
    setPlaying((v) => !v);
  }, [seek]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"]',
        )
      )
        return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo(e.shiftKey);
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void persist(current.current);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        remove();
      } else if (!mod && e.key.toLowerCase() === 's') split();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setPlaying(false);
        seek(clock.current + (e.key === 'ArrowLeft' ? -1 : 1) / current.current.fps);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [togglePlay, undo, duplicate, remove, split, seek, persist]);
  return {
    project,
    ready,
    saved,
    error,
    setError,
    selected,
    setSelected,
    playing,
    setPlaying,
    time,
    clock,
    seek,
    togglePlay,
    edit,
    begin,
    end,
    undo,
    updateClip,
    remove,
    duplicate,
    split,
    persist,
    canUndo: revision >= 0 && history.current.past.length > 0,
    canRedo: history.current.future.length > 0,
  };
}
export type Editor = ReturnType<typeof useEditor>;
