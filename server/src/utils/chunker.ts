/**
 * 文本分块工具
 * 支持多种分块策略：fixed（固定长度）、recursive（递归分隔符）、semantic（语义边界）
 */

export interface ChunkOptions {
  chunkSize: number;        // 分块大小（字符数）
  chunkOverlap: number;     // 重叠大小（字符数）
  chunkStrategy?: 'fixed' | 'recursive' | 'semantic'; // 分块策略
  maxTokens?: number;       // 最大 token 数（用于限制分块大小）
  minChunkSize?: number;    // 最小分块大小，小于此值的分块将被丢弃
  separators?: string;      // 自定义分隔符，逗号分隔
}

/**
 * 文本分块主函数
 * @param text 待分块的文本
 * @param options 分块配置选项
 * @returns 分块后的文本数组
 */
export function chunkText(text: string, options: ChunkOptions): string[] {
  const {
    chunkSize,
    chunkOverlap,
    chunkStrategy = 'recursive',
    maxTokens = 512,
    minChunkSize = 50,
    separators = '\n\n,\n, 。,，,. , ',
  } = options;

  // 解析分隔符
  const separatorList = separators.split(',').map(s => s.trim()).filter(s => s.length > 0);

  // 如果选择 fixed 策略，使用原有的简单分块方法
  if (chunkStrategy === 'fixed') {
    return chunkTextFixed(text, chunkSize, chunkOverlap, minChunkSize);
  }

  // recursive 策略：递归使用分隔符进行分块
  if (chunkStrategy === 'recursive') {
    return chunkTextRecursive(text, chunkSize, chunkOverlap, separatorList, minChunkSize);
  }

  // semantic 策略：尝试在句子边界处切割（简化版）
  if (chunkStrategy === 'semantic') {
    return chunkTextSemantic(text, chunkSize, chunkOverlap, minChunkSize);
  }

  // 默认使用 recursive 策略
  return chunkTextRecursive(text, chunkSize, chunkOverlap, separatorList, minChunkSize);
}

/**
 * 固定长度分块（原有逻辑）
 */
function chunkTextFixed(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  minChunkSize: number,
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

  // 过滤掉过小的分块
  return chunks.filter((c) => c.trim().length >= minChunkSize);
}

/**
 * 递归分块：使用优先级分隔符进行递归分割
 * 优先在段落、句子等自然边界处切割
 */
function chunkTextRecursive(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  separators: string[],
  minChunkSize: number,
): string[] {
  const chunks: string[] = [];
  
  // 首先按标题分割
  const sections = splitByHeadings(text);
  
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;
    
    // 如果当前节小于 chunkSize，直接作为一个分块
    if (trimmed.length <= chunkSize) {
      if (trimmed.length >= minChunkSize) {
        chunks.push(trimmed);
      }
      continue;
    }
    
    // 否则递归分割
    const subChunks = recursiveSplit(trimmed, chunkSize, separators, 0);
    chunks.push(...subChunks);
  }
  
  // 处理重叠并过滤过小的分块
  return applyOverlapAndFilter(chunks, chunkOverlap, minChunkSize);
}

/**
 * 递归分割函数：使用分隔符优先级列表进行分割
 */
function recursiveSplit(
  text: string,
  chunkSize: number,
  separators: string[],
  depth: number,
): string[] {
  // 如果文本已经足够小，返回
  if (text.length <= chunkSize) {
    return [text];
  }
  
  // 如果没有更多分隔符可用，强制按字符切割
  if (depth >= separators.length) {
    return forceSplit(text, chunkSize);
  }
  
  const separator = separators[depth];
  const parts = text.split(separator);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // 如果加上当前部分不超过 chunkSize，合并
    if (currentChunk.length + trimmed.length + separator.length <= chunkSize) {
      currentChunk += (currentChunk ? separator : '') + trimmed;
    } else {
      // 当前块已满，处理并重新开始
      if (currentChunk) {
        if (currentChunk.length > chunkSize) {
          // 递归使用下一个分隔符
          chunks.push(...recursiveSplit(currentChunk, chunkSize, separators, depth + 1));
        } else {
          chunks.push(currentChunk);
        }
      }
      currentChunk = trimmed;
    }
  }
  
  // 处理最后一个块
  if (currentChunk) {
    if (currentChunk.length > chunkSize) {
      chunks.push(...recursiveSplit(currentChunk, chunkSize, separators, depth + 1));
    } else {
      chunks.push(currentChunk);
    }
  }
  
  return chunks;
}

/**
 * 强制按字符切割（当所有分隔符都用完后）
 */
function forceSplit(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * 语义分块：尝试在句子边界处切割
 */
function chunkTextSemantic(
  text: string,
  chunkSize: number,
  chunkOverlap: number,
  minChunkSize: number,
): string[] {
  // 按句子分割（支持中英文句号）
  const sentences = text.split(/(?<=[.!?!.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    
    if (currentChunk.length + trimmed.length <= chunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + trimmed;
    } else {
      if (currentChunk && currentChunk.length >= minChunkSize) {
        chunks.push(currentChunk);
      }
      currentChunk = trimmed;
    }
  }
  
  if (currentChunk && currentChunk.length >= minChunkSize) {
    chunks.push(currentChunk);
  }
  
  return applyOverlapAndFilter(chunks, chunkOverlap, minChunkSize);
}

/**
 * 应用重叠并过滤过小的分块
 */
function applyOverlapAndFilter(
  chunks: string[],
  chunkOverlap: number,
  minChunkSize: number,
): string[] {
  if (chunks.length === 0 || chunkOverlap <= 0) {
    return chunks.filter(c => c.trim().length >= minChunkSize);
  }
  
  const result: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let chunk = chunks[i];
    
    // 如果不是第一个分块，添加与前一个分块的重叠部分
    if (i > 0 && chunkOverlap > 0) {
      const prevChunk = result[result.length - 1];
      const overlapText = prevChunk.slice(-chunkOverlap);
      if (overlapText && !chunk.startsWith(overlapText)) {
        chunk = overlapText + '\n' + chunk;
      }
    }
    
    // 过滤过小的分块
    if (chunk.trim().length >= minChunkSize) {
      result.push(chunk);
    }
  }
  
  return result;
}

/**
 * 按 Markdown 标题分割文本
 */
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

/**
 * 按固定大小分割文本（旧方法，保留兼容）
 */
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
