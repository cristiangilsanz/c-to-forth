import { type Position, fail } from "./errors";

export interface Sym {
  kind: "symbol";
  name: string;
  at?: Position;
}

export interface Str {
  kind: "string";
  value: string;
}

export interface Char {
  kind: "char";
  value: string;
}

export type SExpr = number | Sym | Str | Char | SExpr[];

export function sym(name: string): Sym {
  return { kind: "symbol", name };
}

export function str(value: string): Str {
  return { kind: "string", value };
}

export function isSym(expr: SExpr | undefined, name?: string): expr is Sym {
  return (
    typeof expr === "object" &&
    !Array.isArray(expr) &&
    expr.kind === "symbol" &&
    (name === undefined || expr.name === name)
  );
}

export function isStr(expr: SExpr | undefined): expr is Str {
  return typeof expr === "object" && !Array.isArray(expr) && expr.kind === "string";
}

export function isChar(expr: SExpr | undefined): expr is Char {
  return typeof expr === "object" && !Array.isArray(expr) && expr.kind === "char";
}

export function head(expr: SExpr | undefined): string | undefined {
  return Array.isArray(expr) && isSym(expr[0]) ? expr[0].name : undefined;
}

const CHAR_NAMES: Record<string, string> = {
  space: " ",
  newline: "\n",
  tab: "\t",
  return: "\r",
  linefeed: "\n",
};

export function read(source: string): SExpr[] {
  let index = 0;
  let line = 1;
  let column = 1;

  const advance = (): string => {
    const char = source[index++];
    if (char === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return char;
  };

  const skipBlank = (): void => {
    while (index < source.length) {
      const char = source[index];
      if (char === ";") {
        while (index < source.length && source[index] !== "\n") advance();
      } else if (char === "#" && source[index + 1] === "|") {
        const at = { line, column };
        while (!(source[index] === "|" && source[index + 1] === "#")) {
          if (index >= source.length) fail("unterminated comment", at);
          advance();
        }
        advance();
        advance();
      } else if (/\s/.test(char)) {
        advance();
      } else {
        return;
      }
    }
  };

  const token = (): string => {
    let text = "";
    while (index < source.length && !/[\s()";']/.test(source[index])) text += advance();
    return text;
  };

  const list = (at: Position): SExpr[] => {
    const items: SExpr[] = [];
    for (;;) {
      skipBlank();
      if (index >= source.length) fail("missing closing parenthesis", at);
      if (source[index] === ")") {
        advance();
        return items;
      }
      items.push(readExpr());
    }
  };

  const readExpr = (): SExpr => {
    skipBlank();
    const at = { line, column };
    if (index >= source.length) fail("unexpected end of input", at);
    const char = source[index];
    if (char === "(") {
      advance();
      return list(at);
    }
    if (char === ")") fail("unexpected closing parenthesis", at);
    if (char === "'") {
      advance();
      return [{ kind: "symbol", name: "quote", at }, readExpr()];
    }
    if (char === '"') {
      advance();
      let value = "";
      while (source[index] !== '"') {
        if (index >= source.length) fail("unterminated string", at);
        if (source[index] === "\\") advance();
        value += advance();
      }
      advance();
      return str(value);
    }
    if (char === "#") {
      advance();
      const next = source[index];
      if (next === "'") {
        advance();
        return [{ kind: "symbol", name: "function", at }, readExpr()];
      }
      if (next === "(") {
        advance();
        return [{ kind: "symbol", name: "vector", at }, ...list(at)];
      }
      if (next === "\\") {
        advance();
        const first = advance();
        const rest = token();
        if (!rest) return { kind: "char", value: first };
        const named = CHAR_NAMES[(first + rest).toLowerCase()];
        if (named === undefined) fail(`unknown character name ${first}${rest}`, at);
        return { kind: "char", value: named };
      }
      fail(`unsupported reader macro #${next ?? ""}`, at);
    }
    const text = token();
    if (/^[+-]?\d+\.?$/.test(text)) return Number.parseInt(text, 10);
    if (/^[+-]?\d*\.\d+$/.test(text)) fail("floating-point numbers are not supported", at);
    return { kind: "symbol", name: text.toLowerCase(), at };
  };

  const forms: SExpr[] = [];
  for (;;) {
    skipBlank();
    if (index >= source.length) return forms;
    forms.push(readExpr());
  }
}

const WIDTH = 80;
const BLOCKS = new Set([
  "defun",
  "let*",
  "let",
  "loop",
  "progn",
  "dotimes",
  "block",
  "case",
  "cond",
]);
const STATEMENTS = new Set([
  "setf",
  "setq",
  "incf",
  "decf",
  "format",
  "return",
  "return-from",
  "when",
  "unless",
  "write-char",
  ...BLOCKS,
]);

const CHAR_PRINT: Record<string, string> = { " ": "Space", "\n": "Newline", "\t": "Tab" };

function atom(expr: Exclude<SExpr, SExpr[]>): string {
  if (typeof expr === "number") return String(expr);
  if (expr.kind === "symbol") return expr.name;
  if (expr.kind === "char") return `#\\${CHAR_PRINT[expr.value] ?? expr.value}`;
  return `"${expr.value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

function flat(expr: SExpr): string {
  if (!Array.isArray(expr)) return atom(expr);
  if (head(expr) === "quote" && expr.length === 2) return `'${flat(expr[1])}`;
  if (head(expr) === "function" && expr.length === 2) return `#'${flat(expr[1])}`;
  return `(${expr.map(flat).join(" ")})`;
}

function mustBreak(expr: SExpr): boolean {
  const name = head(expr);
  if (name === undefined || !Array.isArray(expr)) return false;
  if (BLOCKS.has(name)) return true;
  if (name === "if") return expr.slice(2).some((branch) => STATEMENTS.has(head(branch) ?? ""));
  if (name === "when" || name === "unless") return expr.length > 3 || expr.slice(2).some(mustBreak);
  return expr.some(mustBreak);
}

export function print(expr: SExpr, indent = 0): string {
  if (!Array.isArray(expr)) return atom(expr);
  const oneLine = flat(expr);
  if (!mustBreak(expr) && indent + oneLine.length <= WIDTH) return oneLine;

  const pad = (width: number) => `\n${" ".repeat(width)}`;
  const body = (forms: SExpr[], width: number) =>
    forms.map((form) => pad(width) + print(form, width)).join("");
  const aligned = (forms: SExpr[], width: number) =>
    forms.map((form, i) => (i === 0 ? "" : pad(width)) + print(form, width)).join("");
  const name = head(expr);
  const [, first, ...rest] = expr;

  switch (name) {
    case "defun": {
      const [, , params, ...forms] = expr;
      return `(defun ${flat(first)} ${flat(params)}${body(forms, indent + 2)})`;
    }
    case "let":
    case "let*": {
      const width = indent + name.length + 3;
      return `(${name} (${aligned(first as SExpr[], width)})${body(rest, indent + 2)})`;
    }
    case "dotimes":
    case "block":
      return `(${name} ${flat(first)}${body(rest, indent + 2)})`;
    case "case":
      return `(case ${flat(first)}${body(rest, indent + 2)})`;
    case "cond":
      return `(cond ${aligned(expr.slice(1), indent + 6)})`;
    case "loop": {
      const doAt = expr.findIndex((item) => isSym(item, "do"));
      if (doAt < 0) return `(loop${body(expr.slice(1), indent + 2)})`;
      const clauses = expr.slice(1, doAt + 1);
      const forms = expr.slice(doAt + 1);
      const tail = forms.findIndex((item) => isSym(item, "while") || isSym(item, "until"));
      const inner = tail < 0 ? forms : forms.slice(0, tail);
      const after = tail < 0 ? "" : ` ${forms.slice(tail).map(flat).join(" ")}`;
      const header = clauses.map(flat).join(" ");
      return `(loop ${header}${body(inner, indent + 2)}${after})`;
    }
    case "progn":
      return `(progn${body(expr.slice(1), indent + 2)})`;
    case "when":
    case "unless":
      return `(${name} ${print(first, indent + name.length + 2)}${body(rest, indent + 2)})`;
    case "if":
      return `(if ${print(first, indent + 4)}${body(rest, indent + 4)})`;
    default: {
      if (expr.length === 1 || !isSym(expr[0])) return oneLine;
      const prefix = `(${flat(expr[0])} `;
      const width = indent + prefix.length;
      return `${prefix}${print(first, width)}${body(rest, width)})`;
    }
  }
}
