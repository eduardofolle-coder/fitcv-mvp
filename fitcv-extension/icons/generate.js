// Genera los 4 PNGs de ícono sin dependencias externas.
// Uso: node generate.js
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const BG  = [20, 39, 63];    // #14273F
const GOLD = [225, 165, 38]; // #E1A526
const WHITE = [244, 241, 233]; // #F4F1E9

// Tabla CRC32 (usada por PNG)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const tb  = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([len, tb, data, crc]);
}

function makePNG(pixels, size) {
  // pixels: Uint8Array de size*size*3 (RGB sin canal alfa)
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8]=8; ihdr[9]=2; // 8-bit RGB

  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 3;
      const dst = y * (size * 3 + 1) + 1 + x * 3;
      raw[dst]   = pixels[src];
      raw[dst+1] = pixels[src+1];
      raw[dst+2] = pixels[src+2];
    }
  }

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function circle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Pinta un rectángulo en el buffer de píxeles
function rect(pix, size, x1, y1, x2, y2, color) {
  for (let y = Math.max(0, y1); y < Math.min(size, y2); y++) {
    for (let x = Math.max(0, x1); x < Math.min(size, x2); x++) {
      const i = (y * size + x) * 3;
      pix[i] = color[0]; pix[i+1] = color[1]; pix[i+2] = color[2];
    }
  }
}

function generateIcon(size) {
  const pix = new Uint8Array(size * size * 3);
  const s = size;
  const pad = Math.round(s * 0.12);
  const r = Math.round(s * 0.18); // radio de redondeo (aproximado con círculos en esquinas)

  // Fondo
  for (let i = 0; i < pix.length; i += 3) { pix[i]=BG[0]; pix[i+1]=BG[1]; pix[i+2]=BG[2]; }

  // Redondear esquinas pintando BG sobre ellas
  const corners = [[0,0,-1,-1],[s,0,1,-1],[0,s,-1,1],[s,s,1,1]];
  for (const [cx,cy,dx,dy] of corners) {
    for (let y = 0; y < r; y++) for (let x = 0; x < r; x++) {
      if (!circle(x, y, r-1, r-1, r)) {
        // fuera del arco → pintar blanco transparente (usamos BG para simular transparencia)
        const px = cx === 0 ? x : s - 1 - x;
        const py = cy === 0 ? y : s - 1 - y;
        if (px >= 0 && px < s && py >= 0 && py < s) {
          const i = (py * s + px) * 3;
          pix[i]=0; pix[i+1]=0; pix[i+2]=0; // esquinas en negro (transparente real en Web Store)
        }
      }
    }
  }

  // Barra dorada superior
  const barH = Math.max(2, Math.round(s * 0.08));
  rect(pix, s, pad, pad, s - pad, pad + barH, GOLD);

  // Letra "F" en dorado (mitad izquierda)
  const lx = Math.round(s * 0.13);      // left x
  const fy = Math.round(s * 0.28);      // top y de la "F"
  const fw = Math.round(s * 0.08);      // grosor trazo
  const fh = Math.round(s * 0.60);      // alto total
  const fm = Math.round(s * 0.18);      // ancho horizontal
  // Palo vertical
  rect(pix, s, lx, fy, lx+fw, fy+fh, GOLD);
  // Horizontal superior
  rect(pix, s, lx, fy, lx+fm, fy+fw, GOLD);
  // Horizontal medio
  rect(pix, s, lx, fy + Math.round(fh*0.42), lx + Math.round(fm*0.85), fy + Math.round(fh*0.42) + fw, GOLD);

  // Letra "C" en blanco (mitad derecha)
  const cx = Math.round(s * 0.53);
  const cy2 = Math.round(s * 0.28);
  const cw = Math.round(s * 0.08);
  const ch = Math.round(s * 0.60);
  const carm = Math.round(s * 0.20);   // ancho brazos
  // Palo izquierdo
  rect(pix, s, cx, cy2, cx+cw, cy2+ch, WHITE);
  // Brazo superior
  rect(pix, s, cx, cy2, cx+carm, cy2+cw, WHITE);
  // Brazo inferior
  rect(pix, s, cx, cy2+ch-cw, cx+carm, cy2+ch, WHITE);

  return pix;
}

const sizes = [16, 32, 48, 128];
for (const size of sizes) {
  const pix  = generateIcon(size);
  const png  = makePNG(pix, size);
  const file = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓ icon${size}.png (${png.length} bytes)`);
}
console.log('Íconos generados en:', __dirname);
