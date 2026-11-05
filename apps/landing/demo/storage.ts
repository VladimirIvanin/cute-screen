import type {
  MaterialBridge,
  MaterialRecord,
  PersistedDocumentRecord,
} from '@cute-screen/editor-vue'

export interface SavedWork extends PersistedDocumentRecord { sourceHash: string
  viewport?: { zoom: number
    mode: string } }
export class DemoStorage {
  private database: Promise<IDBDatabase> | undefined
  private open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('cute-screen-web-demo', 1)
      request.onupgradeneeded = () => {
        for (const name of ['work', 'blobs', 'materials']) request.result.createObjectStore(name)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'))
      request.onblocked = () => reject(new Error('Close other Cute Screen tabs and retry'))
    })
    return this.database
  }
  async get<T>(
    store: string,
    key: string,
  ): Promise<T | undefined> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const request = db.transaction(store).objectStore(store).get(key)
      request.onsuccess = () => resolve(request.result as T | undefined)
      request.onerror = () => reject(request.error)
    })
  }
  async put(
    store: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error ?? new Error('Storage transaction failed'))
    })
  }
  async save(
    work: SavedWork,
    expected: number | undefined,
  ): Promise<number> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('work', 'readwrite')
      const store = tx.objectStore('work')
      let conflict = false
      const request = store.get('last')
      request.onsuccess = () => {
        const current = request.result as SavedWork | undefined
        if (current?.revision !== expected) {
          conflict = true
          tx.abort()
          return
        }
        store.put(work, 'last')
      }
      tx.oncomplete = () => resolve(work.revision)
      tx.onabort = () => reject(new Error(conflict ? 'Changed in another tab. Download PNG before reloading.' : 'Could not save in this browser. Retry or download PNG.'))
    })
  }
  async clear(store: string): Promise<void> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).clear()
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
  }
  async pruneUnreferenced(): Promise<void> {
    const work = await this.get<SavedWork>('work', 'last')
    const materials = await this.materials.list()
    const references = new Set((JSON.stringify({ work, materials }).match(/[a-f0-9]{64}/gu) ?? []))
    const db = await this.open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('blobs', 'readwrite')
      const cursor = tx.objectStore('blobs').openCursor()
      cursor.onsuccess = () => {
        const item = cursor.result
        if (!item) return
        if (!references.has(String(item.key))) item.delete()
        item.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
  }
  readonly materials: MaterialBridge = {
    list: async () => {
      const db = await this.open()
      return new Promise<MaterialRecord[]>((resolve, reject) => {
        const request = db.transaction('materials').objectStore('materials').getAll()
        request.onsuccess = () => resolve(request.result as MaterialRecord[])
        request.onerror = () => reject(request.error)
      })
    },
    put: async (record) => this.put('materials', record.id, { ...record, byteSize: new Blob([record.valueJson]).size }),
    remove: async (id) => {
      const db = await this.open()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('materials', 'readwrite')
        tx.objectStore('materials').delete(id)
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(tx.error)
      })
    },
  }
}

/** Keep other live tabs and their Undo resources safe while cleaning old sessions. */
export async function holdDemoStorage(storage: DemoStorage): Promise<() => void> {
  if (!navigator.locks) return () => undefined
  await navigator.locks.request('cute-screen-demo-live', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (lock) await storage.pruneUnreferenced()
  })
  return new Promise((resolve, reject) => {
    let release = () => undefined as void
    const lifetime = new Promise<void>((finish) => {
      release = finish
    })
    void navigator.locks.request('cute-screen-demo-live', { mode: 'shared' }, async () => {
      resolve(release)
      await lifetime
    }).catch(reject)
  })
}
