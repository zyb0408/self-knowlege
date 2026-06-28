export type ProgressCallback = (
  fileIndex: number,
  totalFiles: number,
  fileName: string,
  step: string,
  detail: string,
) => void;

export function createProgressCallback(
  res: { write: (data: string) => void },
): ProgressCallback {
  return (fileIndex, total, fileName, step, detail) => {
    const progress = Math.round(((fileIndex - 1) / total) * 100);
    const event = {
      fileIndex,
      totalFiles: total,
      fileName,
      step,
      detail,
      progress,
    };
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
}
