export function chunkText(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const sections = splitByHeadings(text);
  const chunks: string[] = [];
  let currentChunk = '';
  let currentSize = 0;

  for (const section of sections) {
    const sectionTrimmed = section.trim();
    if (!sectionTrimmed) continue;

    if (currentSize + sectionTrimmed.length <= chunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + sectionTrimmed;
      currentSize += sectionTrimmed.length + 2;
      continue;
    }

    if (sectionTrimmed.length > chunkSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
        currentSize = 0;
      }
      const subChunks = splitBySize(sectionTrimmed, chunkSize, chunkOverlap);
      chunks.push(...subChunks);
      continue;
    }

    chunks.push(currentChunk);
    currentChunk = sectionTrimmed;
    currentSize = sectionTrimmed.length;
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks.filter((c) => c.trim().length > 0);
}

function splitByHeadings(text: string): string[] {
  const regex = /^(#{1,6}\s+.+)$/gm;
  const matches: Array<{ heading: string; index: number }> = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    matches.push({ heading: match[0], index: match.index });
  }

  if (matches.length === 0) {
    return [text];
  }

  const sections: string[] = [];
  let start = 0;

  for (let i = 0; i < matches.length; i++) {
    if (i > 0) {
      const section = text.slice(start, matches[i].index);
      if (section.trim()) {
        sections.push(section.trim());
      }
    }
    start = matches[i].index;
  }

  const lastSection = text.slice(start);
  if (lastSection.trim()) {
    sections.push(lastSection.trim());
  }

  return sections;
}

function splitBySize(
  text: string,
  chunkSize: number,
  overlap: number,
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);

    if (end < text.length) {
      const lastSpace = chunk.lastIndexOf(' ', chunk.length - overlap);
      if (lastSpace > chunk.length * 0.5) {
        chunk = chunk.slice(0, lastSpace);
      }
    }

    if (chunk.trim()) {
      chunks.push(chunk.trim());
    }

    start = end - overlap;
    if (overlap >= chunkSize) {
      start = end;
    }
  }

  return chunks;
}
