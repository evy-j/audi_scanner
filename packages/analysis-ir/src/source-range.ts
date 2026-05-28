import type { ExtractionStatus, SolidityFileRecord, SourceRange } from "./types.js";

export class SolidityFileRegistry {
  private readonly filesByIndex = new Map<number, SolidityFileRecord>();
  private readonly lineStartsByIndex = new Map<number, number[]>();

  constructor(files: SolidityFileRecord[]) {
    for (const file of files) {
      this.filesByIndex.set(file.fileIndex, file);
      if (file.content !== undefined) {
        this.lineStartsByIndex.set(file.fileIndex, computeLineStarts(file.content));
      }
    }
  }

  file(fileIndex: number): SolidityFileRecord | undefined {
    return this.filesByIndex.get(fileIndex);
  }

  normalizeSolcSrc(src: unknown): SourceRange {
    if (typeof src !== "string" || !src.trim()) {
      return { status: "NOT_ASSESSED" };
    }

    const [offsetRaw, lengthRaw, fileIndexRaw] = src.split(":");
    const offset = parseInteger(offsetRaw);
    const length = parseInteger(lengthRaw);
    const fileIndex = parseInteger(fileIndexRaw);

    if (offset === undefined || length === undefined || fileIndex === undefined || fileIndex < 0) {
      return { status: "NOT_ASSESSED" };
    }

    const file = this.filesByIndex.get(fileIndex);
    if (!file) {
      return {
        startOffset: offset,
        length,
        status: "PARTIAL"
      };
    }

    const base = {
      filePath: file.filePath,
      startOffset: offset,
      length
    };
    const lineStarts = this.lineStartsByIndex.get(fileIndex);
    if (!lineStarts || file.content === undefined) {
      return {
        ...base,
        status: "PARTIAL" as ExtractionStatus
      };
    }

    const start = offsetToLineColumn(lineStarts, offset);
    const end = offsetToLineColumn(lineStarts, Math.max(offset, offset + length));

    return {
      ...base,
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column,
      status: "EXTRACTED"
    };
  }

  fromLineRange(input: {
    filePath?: string | undefined;
    startLine?: number | undefined;
    endLine?: number | undefined;
    startColumn?: number | undefined;
    endColumn?: number | undefined;
  }): SourceRange {
    if (!input.filePath || !input.startLine) {
      return { status: "NOT_ASSESSED" };
    }

    return {
      filePath: input.filePath,
      startLine: input.startLine,
      endLine: input.endLine ?? input.startLine,
      startColumn: input.startColumn,
      endColumn: input.endColumn,
      status: "PARTIAL"
    };
  }
}

export function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10) {
      starts.push(index + 1);
    }
  }
  return starts;
}

export function offsetToLineColumn(lineStarts: number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const start = lineStarts[mid] ?? 0;
    const next = lineStarts[mid + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      high = mid - 1;
    } else if (offset >= next) {
      low = mid + 1;
    } else {
      return {
        line: mid + 1,
        column: offset - start + 1
      };
    }
  }

  const lastStart = lineStarts[lineStarts.length - 1] ?? 0;
  return {
    line: lineStarts.length,
    column: Math.max(1, offset - lastStart + 1)
  };
}

function parseInteger(value: string | undefined): number | undefined {
  if (value === undefined || value === "" || value === "-1") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}
