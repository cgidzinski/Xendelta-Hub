// The first page of a PDF as a PNG, for the drive's grid thumbnail. pdf.js reads the file and draws it onto a canvas
// (@napi-rs/canvas, prebuilt binaries, no system libraries); sharp then turns the PNG into the same small WebP as for photos.
// Both are loaded on first use, so a server that never meets a PDF never loads them.

/** Longest edge, in pixels, that the first page is drawn at before it is shrunk to the thumbnail. */
const RENDER_EDGE = 720;
/** A PDF that takes longer than this to draw (a huge or malicious one) is given up on. */
const RENDER_TIMEOUT_MS = 20_000;

export async function renderPdfFirstPage(pdf: Buffer): Promise<Buffer> {
  const [{ createCanvas }, pdfjs] = await Promise.all([
    import("@napi-rs/canvas"),
    import("pdfjs-dist/legacy/build/pdf.mjs"),
  ]);
  const task = pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
    stopAtErrors: false,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const doc = await task.promise;
        const page = await doc.getPage(1);
        const natural = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: RENDER_EDGE / Math.max(natural.width, natural.height) });
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff"; // a PDF page is transparent until something is drawn on it
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context as never, viewport, canvas: canvas as never }).promise;
        return canvas.toBuffer("image/png");
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Rendering the PDF took too long")), RENDER_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await task.destroy().catch(() => undefined);
  }
}
