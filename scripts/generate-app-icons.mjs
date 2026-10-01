import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const assetDirectory = path.join(projectRoot, "assets");
const matrixSize = 21;
const moduleSize = 24;
const moduleGap = 6;
const modulePitch = moduleSize + moduleGap;
const gridSize = matrixSize * modulePitch - moduleGap;
const gridOrigin = (1024 - gridSize) / 2;
const matrix = Array.from({ length: matrixSize }, () =>
  Array(matrixSize).fill(false),
);
const reserved = Array.from({ length: matrixSize }, () =>
  Array(matrixSize).fill(false),
);

function setFinder(originX, originY) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const column = originX + x;
      const row = originY + y;
      if (column < 0 || row < 0 || column >= matrixSize || row >= matrixSize) {
        continue;
      }

      reserved[row][column] = true;
      if (x >= 0 && x <= 6 && y >= 0 && y <= 6) {
        matrix[row][column] =
          x === 0 ||
          x === 6 ||
          y === 0 ||
          y === 6 ||
          (x >= 2 && x <= 4 && y >= 2 && y <= 4);
      }
    }
  }
}

setFinder(0, 0);
setFinder(matrixSize - 7, 0);
setFinder(0, matrixSize - 7);

for (let index = 8; index <= 12; index += 1) {
  matrix[6][index] = index % 2 === 0;
  matrix[index][6] = index % 2 === 0;
  reserved[6][index] = true;
  reserved[index][6] = true;
}

for (let y = 14; y <= 18; y += 1) {
  for (let x = 14; x <= 18; x += 1) {
    const offsetX = x - 14;
    const offsetY = y - 14;
    matrix[y][x] =
      offsetX === 0 ||
      offsetX === 4 ||
      offsetY === 0 ||
      offsetY === 4 ||
      (offsetX === 2 && offsetY === 2);
    reserved[y][x] = true;
  }
}

for (let y = 0; y < matrixSize; y += 1) {
  for (let x = 0; x < matrixSize; x += 1) {
    if (!reserved[y][x]) {
      const value = (x * 17 + y * 31 + x * y * 7 + 13) % 19;
      matrix[y][x] = value < 9;
    }
  }
}

const modules = matrix
  .flatMap((row, y) =>
    row.flatMap((isDark, x) =>
      isDark
        ? [
            `<rect x="${gridOrigin + x * modulePitch}" y="${gridOrigin + y * modulePitch}" width="${moduleSize}" height="${moduleSize}" rx="4"/>`,
          ]
        : [],
    ),
  )
  .join("");

function makeSvg({ background, foreground, accent, monochrome = false }) {
  const backdrop = background
    ? `<defs><linearGradient id="backdrop" x2="1" y2="1"><stop stop-color="#173D30"/><stop offset="1" stop-color="#102B25"/></linearGradient></defs><rect width="1024" height="1024" fill="url(#backdrop)"/><rect x="126" y="126" width="772" height="772" rx="160" fill="#F4F3EC" stroke="#D8EE76" stroke-width="12"/>`
    : "";
  const beam = monochrome
    ? ""
    : `<path d="M160 512H864" stroke="${accent}" stroke-width="10" stroke-linecap="round"/><circle cx="864" cy="512" r="16" fill="${accent}"/>`;
  const centerMark = monochrome
    ? ""
    : `<circle cx="512" cy="512" r="62" fill="${accent}" stroke="${background ? "#F4F3EC" : "#D8EE76"}" stroke-width="12"/><path d="M512 480v64M480 512h64" stroke="#F4F3EC" stroke-width="13" stroke-linecap="round"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${backdrop}<g fill="${foreground}">${modules}</g>${beam}${centerMark}</svg>`;
}

mkdirSync(assetDirectory, { recursive: true });
const outputs = [
  [
    "qrplus-icon.svg",
    makeSvg({ background: true, foreground: "#173D30", accent: "#E87556" }),
  ],
  [
    "qrplus-android-foreground.svg",
    makeSvg({ background: false, foreground: "#173D30", accent: "#E87556" }),
  ],
  [
    "qrplus-android-monochrome.svg",
    makeSvg({
      background: false,
      foreground: "#FFFFFF",
      accent: "#FFFFFF",
      monochrome: true,
    }),
  ],
];

for (const [fileName, svg] of outputs) {
  writeFileSync(path.join(assetDirectory, fileName), svg);
}
