import fs from 'node:fs';
import zlib from 'node:zlib';

const input = process.argv[2];
if (!input) throw new Error('Informe o caminho do PDF.');

const source = fs.readFileSync(input).toString('latin1');

function decodeAscii85(value) {
  const sourceValue = value.replaceAll('<~', '').replaceAll('~>', '').replace(/\s/g, '');
  const output = [];
  let group = [];

  for (const char of sourceValue) {
    if (char === 'z' && group.length === 0) {
      output.push(0, 0, 0, 0);
      continue;
    }
    const digit = char.charCodeAt(0) - 33;
    if (digit < 0 || digit > 84) continue;
    group.push(digit);
    if (group.length === 5) {
      const number = group.reduce((total, current) => total * 85 + current, 0) >>> 0;
      output.push(number >>> 24, (number >>> 16) & 255, (number >>> 8) & 255, number & 255);
      group = [];
    }
  }

  if (group.length > 0) {
    const originalLength = group.length;
    while (group.length < 5) group.push(84);
    const number = group.reduce((total, current) => total * 85 + current, 0) >>> 0;
    output.push(...[number >>> 24, (number >>> 16) & 255, (number >>> 8) & 255, number & 255].slice(0, originalLength - 1));
  }
  return Buffer.from(output);
}

function decodePdfString(value) {
  const bytes = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\\') {
      bytes.push(value.charCodeAt(index));
      continue;
    }
    const escaped = value[++index];
    if (/[0-7]/.test(escaped)) {
      let octal = escaped;
      while (octal.length < 3 && /[0-7]/.test(value[index + 1] ?? '')) octal += value[++index];
      bytes.push(Number.parseInt(octal, 8));
      continue;
    }
    const controls = { n: 10, r: 13, t: 9, b: 8, f: 12 };
    bytes.push(controls[escaped] ?? escaped.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('latin1');
}

const streamPattern = /(?:^|[\r\n])stream\r?\n([\s\S]*?)endstream/g;
const textPattern = /\(((?:\\.|[^\\()])*)\)\s*Tj/g;
let streamMatch;
let page = 0;

while ((streamMatch = streamPattern.exec(source))) {
  try {
    const decoded = zlib.inflateSync(decodeAscii85(streamMatch[1])).toString('latin1');
    const lines = [];
    let textMatch;
    while ((textMatch = textPattern.exec(decoded))) lines.push(decodePdfString(textMatch[1]));
    if (lines.length === 0) continue;
    page += 1;
    process.stdout.write(`=== PÁGINA ${page} ===\n${lines.join('\n')}\n`);
  } catch {
    // Nem todo stream do PDF representa conteúdo textual de página.
  }
}
