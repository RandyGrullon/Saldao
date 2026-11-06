// Fotos en la web: elegir o tomar una, y achicarla (1600 px de lado, JPEG) para subirla liviana o mandarla a leer.
export interface Photo { blob: Blob; base64: string; uri: string }

/** Abre la cámara (en el teléfono) o el selector de archivos. Si la persona cancela: null. */
export function pickPhoto(camera = true): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    if (camera) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

const toBase64 = (b: Blob) => new Promise<string>((ok, bad) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] ?? '');
  r.onerror = () => bad(r.error);
  r.readAsDataURL(b);
});

export async function readPhoto(file: File, max = 1600): Promise<Photo> {
  const img = await createImageBitmap(file).catch(() => { throw new Error('No se pudo abrir esa imagen'); });
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * k); canvas.height = Math.round(img.height * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok, bad) => canvas.toBlob(b => (b ? ok(b) : bad(new Error('No se pudo preparar la foto'))), 'image/jpeg', 0.82));
  return { blob, base64: await toBase64(blob), uri: URL.createObjectURL(blob) };
}
