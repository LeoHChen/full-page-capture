#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {jpegToPdf, jpegSize} from './pdf.mjs';
const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length || resolve(input) === resolve(output)) {
  console.error('Usage: node export-pdf.mjs INPUT.jpg OUTPUT.pdf (different paths)'); process.exitCode = 1;
} else {
  try {
    const jpeg = new Uint8Array(await readFile(input));
    const size = jpegSize(jpeg);
    await writeFile(output, jpegToPdf(jpeg), {flag: 'wx'});
    console.log(`Saved one-page PDF: ${output} (${size.width} × ${size.height} source pixels)`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
