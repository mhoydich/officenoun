/* Office Noun brick renderer. Integer-scale pixels, optional LEGO-style studs.
   Palette indices are base64-decoded bytes into nouns.json.palette. */
'use strict';

const OfficeNounBricks = (() => {
  function decodePx(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    if (h === '00000000' || h.length === 8 && h.endsWith('00')) return null;
    const n = h.length === 8 ? h.slice(0, 6) : h;
    return [
      parseInt(n.slice(0, 2), 16),
      parseInt(n.slice(2, 4), 16),
      parseInt(n.slice(4, 6), 16)
    ];
  }

  function rgbToHex(r, g, b) {
    const c = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
    return '#' + c(r) + c(g) + c(b);
  }

  function shade(hex, amt) {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const t = amt > 0 ? 255 : 0;
    const p = Math.abs(amt);
    return rgbToHex(
      Math.round(rgb[0] + (t - rgb[0]) * p),
      Math.round(rgb[1] + (t - rgb[1]) * p),
      Math.round(rgb[2] + (t - rgb[2]) * p)
    );
  }

  function colorAt(palette, index, fallback) {
    const raw = palette[index];
    if (!raw) return fallback;
    const rgb = hexToRgb(raw);
    if (!rgb) return fallback;
    return '#' + (raw.replace('#', '').length === 8 ? raw.replace('#', '').slice(0, 6) : raw.replace('#', ''));
  }

  function drawBrick(ctx, x, y, size, hex) {
    const grout = 1;
    const body = size - grout;
    ctx.fillStyle = shade(hex, -0.38);
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = hex;
    ctx.fillRect(x, y, body, body);
    ctx.fillStyle = shade(hex, 0.2);
    ctx.fillRect(x, y, body, 1);
    ctx.fillRect(x, y, 1, body);
    ctx.fillStyle = shade(hex, -0.18);
    if (body > 1) {
      ctx.fillRect(x, y + body - 1, body, 1);
      ctx.fillRect(x + body - 1, y, 1, body);
    }
    const stud = Math.max(2, Math.floor(size * 0.34));
    const sx = x + Math.floor((body - stud) / 2);
    const sy = y + Math.max(0, Math.floor((body - stud) / 2) - 1);
    ctx.fillStyle = shade(hex, 0.22);
    ctx.fillRect(sx, sy, stud, stud);
    ctx.fillStyle = shade(hex, 0.4);
    ctx.fillRect(sx, sy, stud, 1);
    ctx.fillStyle = shade(hex, -0.16);
    ctx.fillRect(sx, sy + stud - 1, stud, 1);
  }

  function paint(ctx, pixels, palette, bg, originX, originY, cell, bricks) {
    const fallback = bg.startsWith('#') ? bg : '#' + bg;
    const useBricks = bricks && cell >= 8;
    for (let py = 0; py < 32; py += 1) {
      for (let px = 0; px < 32; px += 1) {
        const hex = colorAt(palette, pixels[py * 32 + px], fallback);
        const x = originX + px * cell;
        const y = originY + py * cell;
        if (useBricks) drawBrick(ctx, x, y, cell, hex);
        else {
          ctx.fillStyle = hex;
          ctx.fillRect(x, y, cell, cell);
        }
      }
    }
  }

  function nounCanvas(pack, ticker, cell, bricks) {
    const rec = pack.nouns[ticker];
    const canvas = document.createElement('canvas');
    const size = 32 * cell;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (!rec) {
      ctx.fillStyle = '#d5d7e1';
      ctx.fillRect(0, 0, size, size);
      return canvas;
    }
    const bg = rec.bg || 'd5d7e1';
    ctx.fillStyle = '#' + bg.replace('#', '');
    ctx.fillRect(0, 0, size, size);
    paint(ctx, decodePx(rec.px), pack.palette, bg, 0, 0, cell, bricks);
    return canvas;
  }

  return { decodePx, shade, paint, nounCanvas, hexToRgb, rgbToHex };
})();
