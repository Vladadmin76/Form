type ZxingReader = {
  decodeFromCanvas: (canvas: HTMLCanvasElement) => { getText: () => string };
  decodeFromConstraints: (
    constraints: MediaStreamConstraints,
    preview: HTMLVideoElement,
    callback: (result: { getText: () => string } | undefined) => void,
  ) => Promise<{ stop: () => void }>;
};

async function productReader(): Promise<ZxingReader> {
  const libMod = (await import("@zxing/library")) as unknown as { default?: Record<string, unknown> } & Record<string, unknown>;
  const browserMod = (await import("@zxing/browser")) as unknown as {
    default?: { BrowserMultiFormatReader?: new (hints: Map<unknown, unknown>, options: object) => ZxingReader };
    BrowserMultiFormatReader?: new (hints: Map<unknown, unknown>, options: object) => ZxingReader;
  };
  const lib = libMod.default ?? libMod;
  const BarcodeFormat = lib.BarcodeFormat as Record<string, unknown> | undefined;
  const DecodeHintType = lib.DecodeHintType as Record<string, unknown> | undefined;
  const Ctor = browserMod.BrowserMultiFormatReader ?? browserMod.default?.BrowserMultiFormatReader;
  if (!BarcodeFormat || !DecodeHintType || !Ctor) throw new Error("Сканер недоступен");
  const hints = new Map<unknown, unknown>();
  hints.set(DecodeHintType.TRY_HARDER, true);
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
  ]);
  return new Ctor(hints, { delayBetweenScanAttempts: 200, tryPlayVideoTimeout: 8000 });
}

export { productReader };

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

export async function lockFocus(video: HTMLVideoElement) {
  const stream = video.srcObject;
  if (!(stream instanceof MediaStream)) return;
  const track = stream.getVideoTracks()[0];
  if (!track?.getCapabilities) return;
  const modes = (track.getCapabilities() as { focusMode?: string[] }).focusMode ?? [];
  const mode = modes.includes("continuous") ? "continuous" : modes.includes("single-shot") ? "single-shot" : "";
  if (!mode) return;
  try {
    await track.applyConstraints({ advanced: [{ focusMode: mode }] } as unknown as MediaTrackConstraints);
  } catch {
    // У этой камеры нет программного фокуса.
  }
}

const sharpnessCanvas = typeof document === "undefined" ? null : document.createElement("canvas");

/** Дисперсия лапласиана: низкая — кадр размыт, высокая — полоски резкие. */
export function blurScore(video: HTMLVideoElement): number | null {
  if (!sharpnessCanvas || video.readyState < 2 || video.videoWidth < 2) return null;
  const width = 96;
  const height = Math.max(2, Math.round((video.videoHeight / video.videoWidth) * width));
  sharpnessCanvas.width = width;
  sharpnessCanvas.height = height;
  const ctx = sharpnessCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = (px: number, py: number) => {
        const i = (py * width + px) * 4;
        return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      };
      const lap = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * at(x, y);
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  if (!count) return null;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function nativeDetector(): Detector | null {
  const host = window as Window & { BarcodeDetector?: new (opts: { formats: string[] }) => Detector };
  if (!host.BarcodeDetector) return null;
  try {
    return new host.BarcodeDetector({ formats: ["upc_a", "upc_e", "ean_13", "ean_8", "code_128"] });
  } catch {
    return null;
  }
}

async function detectNative(source: CanvasImageSource): Promise<string | null> {
  const detector = nativeDetector();
  if (!detector) return null;
  try {
    const found = await detector.detect(source);
    const value = found.find((item) => item.rawValue && item.rawValue.replace(/\D/g, "").length >= 8)?.rawValue;
    return value ?? null;
  } catch {
    return null;
  }
}

function canvasOf(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  draw(ctx);
  return canvas;
}

function fit(width: number, height: number, max = 1400) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function variants(source: CanvasImageSource, width: number, height: number) {
  const size = fit(width, height);
  const list: HTMLCanvasElement[] = [];
  const add = (angle: number, contrast: boolean) => {
    const swap = angle % 180 !== 0;
    const w = swap ? size.height : size.width;
    const h = swap ? size.width : size.height;
    const canvas = canvasOf(w, h, (ctx) => {
      ctx.translate(w / 2, h / 2);
      ctx.rotate((angle * Math.PI) / 180);
      if (contrast) ctx.filter = "grayscale(1) contrast(1.7)";
      ctx.drawImage(source, -size.width / 2, -size.height / 2, size.width, size.height);
    });
    if (canvas) list.push(canvas);
  };
  for (const angle of [0, 90, 270, 180]) add(angle, false);
  add(0, true);
  add(90, true);
  return list;
}

export async function decodeBarcodeFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  try {
    const native = await detectNative(bitmap);
    if (native) return native;
    const reader = await productReader();
    for (const canvas of variants(bitmap, bitmap.width, bitmap.height)) {
      const nativeCanvas = await detectNative(canvas);
      if (nativeCanvas) return nativeCanvas;
      try {
        const text = reader.decodeFromCanvas(canvas).getText().replace(/\s/g, "");
        if (text.replace(/\D/g, "").length >= 8) return text;
      } catch {
        // Следующий поворот или контраст.
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}
