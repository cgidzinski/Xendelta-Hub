import qrcode from "qrcode-generator";

export interface QrPath {
  /** Modules per side (without the quiet border). */
  count: number;
  /** SVG path data for every dark module, one 1x1 square each, in module units. */
  d: string;
}

/**
 * The QR code for some text as SVG path data, so it can be drawn as an <svg> (no HTML string to inject). Medium error
 * correction. The type number is chosen to fit the text; a link's address is short, so this is always a small code.
 */
export function qrPath(text: string): QrPath {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  let d = "";
  for (let row = 0; row < count; row++) {
    // One horizontal run per stretch of dark modules keeps the path short.
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      let end = col;
      while (end + 1 < count && qr.isDark(row, end + 1)) end++;
      d += `M${col} ${row}h${end - col + 1}v1h-${end - col + 1}z`;
      col = end;
    }
  }
  return { count, d };
}

/** The quiet zone around a code, in modules (the QR standard asks for 4). */
export const QR_BORDER = 4;

/** A standalone SVG file for a code: black on white, with its quiet zone, for printing or sharing. */
export function qrSvgFile(text: string, pixels = 512): string {
  const { count, d } = qrPath(text);
  const size = count + QR_BORDER * 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${pixels}" height="${pixels}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="white"/>` +
    `<path transform="translate(${QR_BORDER} ${QR_BORDER})" d="${d}" fill="black"/></svg>`
  );
}
