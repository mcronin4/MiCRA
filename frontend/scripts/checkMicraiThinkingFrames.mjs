import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const FRAME_FILES = [
  "robot-thinking-frame-1.png",
  "robot-thinking-frame-2.png",
  "robot-thinking-frame-3.png",
  "robot-thinking-frame-4.png",
  "robot-thinking-frame-5.png",
];

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePngRgba(filePath) {
  const data = fs.readFileSync(filePath);
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`Invalid PNG signature: ${filePath}`);
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const chunkData = data.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
    } else if (type === "IDAT") {
      idatChunks.push(chunkData);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!width || !height) {
    throw new Error(`Missing PNG IHDR: ${filePath}`);
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `Unsupported PNG format in ${filePath} (bitDepth=${bitDepth}, colorType=${colorType}). Expected RGBA8.`
    );
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (raw.length !== expectedLength) {
    throw new Error(`Unexpected inflated size for ${filePath}: ${raw.length} != ${expectedLength}`);
  }

  const pixels = Buffer.alloc(width * height * 4);
  let rawOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = raw[rawOffset];
    rawOffset += 1;
    const outRowStart = y * stride;
    const prevRowStart = outRowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const source = raw[rawOffset + x];
      const left = x >= bytesPerPixel ? pixels[outRowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[prevRowStart + x] : 0;
      const upLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[prevRowStart + x - bytesPerPixel]
          : 0;

      let value = source;
      if (filterType === 1) value = (source + left) & 0xff;
      else if (filterType === 2) value = (source + up) & 0xff;
      else if (filterType === 3) value = (source + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) value = (source + paethPredictor(left, up, upLeft)) & 0xff;
      else if (filterType !== 0) {
        throw new Error(`Unsupported PNG filter ${filterType} in ${filePath}`);
      }
      pixels[outRowStart + x] = value;
    }
    rawOffset += stride;
  }

  return { width, height, pixels };
}

function alphaBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  const stride = png.width * 4;

  for (let y = 0; y < png.height; y += 1) {
    const row = y * stride;
    for (let x = 0; x < png.width; x += 1) {
      const alpha = png.pixels[row + x * 4 + 3];
      if (alpha === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0 || maxY < 0) return null;
  return {
    minX,
    minY,
    maxX: maxX + 1,
    maxY: maxY + 1,
  };
}

function boundsLabel(bounds) {
  if (!bounds) return "empty";
  return `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`;
}

function main() {
  const publicDir = path.resolve(process.cwd(), "public");
  const baseFile = path.join(publicDir, "robot-full-body.png");
  const base = decodePngRgba(baseFile);
  const baseBounds = alphaBounds(base);
  if (!baseBounds) {
    throw new Error("Base robot image has no visible alpha content.");
  }

  for (const frameFile of FRAME_FILES) {
    const framePath = path.join(publicDir, frameFile);
    const frame = decodePngRgba(framePath);
    const frameBounds = alphaBounds(frame);
    if (!frameBounds) {
      throw new Error(`${frameFile} has no visible alpha content.`);
    }
    const sameSize = frame.width === base.width && frame.height === base.height;
    const sameBounds =
      frameBounds.minX === baseBounds.minX &&
      frameBounds.minY === baseBounds.minY &&
      frameBounds.maxX === baseBounds.maxX &&
      frameBounds.maxY === baseBounds.maxY;

    if (!sameSize || !sameBounds) {
      throw new Error(
        `${frameFile} mismatch. base=${base.width}x${base.height} bounds(${boundsLabel(baseBounds)}), ` +
          `frame=${frame.width}x${frame.height} bounds(${boundsLabel(frameBounds)})`
      );
    }
  }

  console.log("MicrAI thinking frames validated.");
}

main();
