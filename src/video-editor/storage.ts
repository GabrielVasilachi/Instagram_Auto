import type { Project } from './types'

const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('silent-forward-video-editor', 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('project')
      req.result.createObjectStore('media')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
async function transaction<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode),
      request = action(tx.objectStore(store))
    tx.oncomplete = () => {
      db.close()
      resolve(request.result)
    }
    tx.onerror = tx.onabort = () => {
      db.close()
      reject(tx.error || new Error('Local storage is unavailable.'))
    }
  })
}
export const loadProject = () =>
  transaction<Project | undefined>('project', 'readonly', (s) => s.get('current'))
export const saveProject = (project: Project) =>
  transaction('project', 'readwrite', (s) => s.put(project, 'current'))
export const saveMedia = (id: string, file: Blob) =>
  transaction('media', 'readwrite', (s) => s.put(file, id))
export const getMedia = (id: string) =>
  transaction<Blob | undefined>('media', 'readonly', (s) => s.get(id))
export const clearMedia = () => transaction('media', 'readwrite', (s) => s.clear())
