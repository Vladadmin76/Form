export type ProgressPhoto = {
  id: string;
  date: string;
  note: string;
  dataUrl: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("forma", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB"));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb"));
  });
}

export async function listPhotos(): Promise<ProgressPhoto[]> {
  const db = await openDb();
  const rows = await request(db.transaction("photos").objectStore("photos").getAll());
  db.close();
  return (rows as ProgressPhoto[]).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export async function savePhoto(photo: ProgressPhoto): Promise<void> {
  const db = await openDb();
  await request(db.transaction("photos", "readwrite").objectStore("photos").put(photo));
  db.close();
}

export async function deletePhoto(id: string): Promise<void> {
  const db = await openDb();
  await request(db.transaction("photos", "readwrite").objectStore("photos").delete(id));
  db.close();
}

export async function replacePhotos(photos: ProgressPhoto[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    const store = tx.objectStore("photos");
    store.clear();
    for (const photo of photos) store.put(photo);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("idb"));
  });
  db.close();
}

export async function fileToJpeg(file: File, max = 960, quality = 0.72): Promise<{ base64: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("blob"))), "image/jpeg", quality);
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  const base64 = btoa(binary);
  return { base64, dataUrl: `data:image/jpeg;base64,${base64}` };
}
