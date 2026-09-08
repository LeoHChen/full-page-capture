const encode = text => new TextEncoder().encode(text);

export function jpegSize(bytes) {
  if (bytes[0] !== 255 || bytes[1] !== 216) throw new Error('Expected a JPEG image.');
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset++] !== 255) throw new Error('Invalid JPEG marker.');
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 217 || marker === 218) break;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    const length = bytes[offset] * 256 + bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error('Truncated JPEG image.');
    if ([192,193,194].includes(marker)) {
      const height = bytes[offset+3] * 256 + bytes[offset+4], width = bytes[offset+5] * 256 + bytes[offset+6];
      const components = bytes[offset+7];
      if (!width || !height || bytes[offset+2] !== 8 || ![1,3].includes(components)) throw new Error('Use an 8-bit RGB or grayscale JPEG.');
      return {width, height, components};
    }
    offset += length;
  }
  throw new Error('JPEG dimensions could not be read.');
}

// Binary-safe, dependency-free PDF writer. Embeds JPEG bytes without resampling.
export function jpegToPdf(jpeg) {
  const {width, height, components} = jpegSize(jpeg);
  const scale = Math.min(0.75, 14000 / width, 14000 / height);
  const w = +(width * scale).toFixed(4), h = +(height * scale).toFixed(4);
  const content = encode(`q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`);
  const parts = [encode('%PDF-1.4\n% Full Page Capture\n')];
  const offsets = [0];
  let length = parts[0].length;
  const add = bytes => { parts.push(bytes); length += bytes.length; };
  const object = (id, body, stream) => {
    offsets[id] = length;
    add(encode(`${id} 0 obj\n${body}`));
    if (stream) { add(encode('\nstream\n')); add(stream); add(encode('\nendstream')); }
    add(encode('\nendobj\n'));
  };
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /${components === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  object(5, `<< /Length ${content.length} >>`, content);
  const xref = length;
  add(encode(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  const pdf = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) { pdf.set(part, cursor); cursor += part.length; }
  return pdf;
}

export function safeFilename(title) {
  const cleaned = String(title).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '-').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
  let name = '';
  for (const character of cleaned) {
    if (encode(name + character).length > 180) break;
    name += character;
  }
  name = name.replace(/[. ]+$/g, '') || 'full-page';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `capture-${name}`;
  return name;
}
