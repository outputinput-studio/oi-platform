import QRCode from "qrcode";

/**
 * The QR code an authenticator app scans, as one SVG path (qrcode, approved
 * by Carl, Oct 2026). Drawn in currentColor so the screen paints it with
 * tokens, never a raw colour; a quiet zone of four modules all round.
 */
export function qrSvgPath(text: string): { size: number; d: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const quiet = 4;
  let d = "";
  for (let y = 0; y < modules.size; y++) {
    for (let x = 0; x < modules.size; x++) {
      if (modules.get(y, x)) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  return { size: modules.size + quiet * 2, d };
}
