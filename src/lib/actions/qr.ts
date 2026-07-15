'use server';

/** Render a QR code for any URL as an inline SVG string (server-side). */
export async function qrForUrl(url: string): Promise<string | null> {
  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return null;
  try {
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toString(url, { type: 'svg', margin: 1, width: 220 });
  } catch {
    return null;
  }
}
