// 機材写真の保存（IndexedDB）と画像の縮小。localStorage は容量が小さいので写真はこちらに置く。
window.PhotoStore = (() => {
  'use strict';

  const DB_NAME = 'guitar-gear';
  const STORE = 'photos';
  let dbPromise = null;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  }

  function run(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  // 長辺 maxEdge px の JPEG に縮小する（向きは EXIF に従って補正される）
  async function resize(file, maxEdge = 1568, quality = 0.85) {
    let source;
    try {
      source = await createImageBitmap(file);
    } catch {
      source = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み込めませんでした')); };
        img.src = url;
      });
    }
    const w = source.width;
    const h = source.height;
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    if (source.close) source.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('画像を変換できませんでした');
    return blob;
  }

  function toBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  return {
    get: id => run('readonly', s => s.get(id)),
    put: (id, blob) => {
      // 端末の空き容量が減っても消されにくくする（対応ブラウザのみ・失敗しても無視）
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      return run('readwrite', s => s.put(blob, id));
    },
    remove: id => run('readwrite', s => s.delete(id)),
    resize,
    toBase64,
  };
})();
