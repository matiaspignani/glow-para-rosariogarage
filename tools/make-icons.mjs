// Generates icons/icon{16,32,48,128}.png: an orange rounded square with a dark heart.
// No dependencies (hand-rolled PNG encoder). Usage: node tools/make-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const ORANGE = [255, 138, 31];
const DARK = [27, 27, 27];
const SS = 4; // supersampling per axis

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

const inRoundedSquare = (x, y, r) => {
  // x, y in [0,1]
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const inHeart = (x, y) => {
  const hx = (x - 0.5) * 2.7;
  const hy = -(y - 0.52) * 2.7;
  return (hx * hx + hy * hy - 1) ** 3 - hx * hx * hy ** 3 <= 0;
};

function png(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let bg = 0, heart = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          if (inRoundedSquare(u, v, 0.22)) {
            bg++;
            if (inHeart(u, v)) heart++;
          }
        }
      }
      const total = SS * SS;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const h = bg ? heart / bg : 0;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(ORANGE[c] * (1 - h) + DARK[c] * h);
      raw[o + 3] = Math.round((bg / total) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync("icons", { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(`icons/icon${size}.png`, png(size));
console.log("icons written");
