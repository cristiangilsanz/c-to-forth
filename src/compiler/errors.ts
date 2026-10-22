export class CompileError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(message);
    this.name = "CompileError";
  }

  toString(): string {
    return `${this.line}:${this.column}: ${this.message}`;
  }
}

export interface Position {
  line: number;
  column: number;
}

export function fail(message: string, at: Position): never {
  throw new CompileError(message, at.line, at.column);
}
