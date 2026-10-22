import { type Position, fail } from "./errors";

export type TokenKind = "number" | "string" | "name" | "keyword" | "symbol" | "embed" | "end";

export interface Token extends Position {
  kind: TokenKind;
  text: string;
  value: number;
}

const KEYWORDS = new Set([
  "int",
  "void",
  "char",
  "short",
  "long",
  "signed",
  "unsigned",
  "bool",
  "_Bool",
  "const",
  "static",
  "if",
  "else",
  "while",
  "do",
  "for",
  "switch",
  "case",
  "default",
  "break",
  "continue",
  "return",
]);
const SYMBOLS = [
  "<<=",
  ">>=",
  "&&",
  "||",
  "==",
  "!=",
  "<=",
  ">=",
  "<<",
  ">>",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  ..."+-*/%<>=!~&|^?:(){}[],;",
];
const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "0": "\0",
  "\\": "\\",
  '"': '"',
  "'": "'",
};

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  let lineStart = true;

  const peek = (offset = 0) => source[index + offset] ?? "";
  const advance = (): string => {
    const char = source[index++];
    if (char === "\n") {
      line++;
      column = 1;
      lineStart = true;
    } else {
      column++;
      if (!/\s/.test(char)) lineStart = false;
    }
    return char;
  };
  const restOfLine = (): string => {
    let text = "";
    while (index < source.length && peek() !== "\n") text += advance();
    return text;
  };
  const escaped = (at: Position): string => {
    advance();
    const char = advance();
    const value = ESCAPES[char];
    if (value === undefined) fail(`unknown escape sequence \\${char}`, at);
    return value;
  };

  while (index < source.length) {
    const char = peek();
    const at = { line, column };
    const push = (kind: TokenKind, text: string, value = 0) =>
      tokens.push({ kind, text, value, ...at });

    if (/\s/.test(char)) {
      advance();
    } else if (char === "#" && lineStart) {
      restOfLine();
    } else if (char === "/" && peek(1) === "/") {
      if (peek(2) === "@") {
        advance();
        advance();
        advance();
        push("embed", restOfLine().trim());
      } else {
        restOfLine();
      }
    } else if (char === "/" && peek(1) === "*") {
      advance();
      advance();
      while (!(peek() === "*" && peek(1) === "/")) {
        if (index >= source.length) fail("unterminated comment", at);
        advance();
      }
      advance();
      advance();
    } else if (/\d/.test(char)) {
      let text = "";
      while (/\w/.test(peek())) text += advance();
      const digits = text.replace(/[uUlL]+$/, "");
      let value = Number.NaN;
      if (/^0[xX][0-9a-fA-F]+$/.test(digits)) value = Number.parseInt(digits.slice(2), 16);
      else if (/^0[0-7]+$/.test(digits)) value = Number.parseInt(digits.slice(1), 8);
      else if (/^\d+$/.test(digits)) value = Number(digits);
      if (Number.isNaN(value)) fail(`invalid number '${text}'`, at);
      push("number", text, value);
    } else if (/[A-Za-z_]/.test(char)) {
      let text = "";
      while (/\w/.test(peek())) text += advance();
      push(KEYWORDS.has(text) ? "keyword" : "name", text);
    } else if (char === '"') {
      advance();
      let text = "";
      while (peek() !== '"') {
        if (index >= source.length || peek() === "\n") fail("unterminated string", at);
        text += peek() === "\\" ? escaped(at) : advance();
      }
      advance();
      push("string", text);
    } else if (char === "'") {
      advance();
      const text = peek() === "\\" ? escaped(at) : advance();
      if (advance() !== "'") fail("invalid character literal", at);
      push("number", `'${text}'`, text.charCodeAt(0));
    } else {
      const symbol = SYMBOLS.find((candidate) => source.startsWith(candidate, index));
      if (!symbol) fail(`unexpected character '${char}'`, at);
      for (let i = 0; i < symbol.length; i++) advance();
      push("symbol", symbol);
    }
  }
  tokens.push({ kind: "end", text: "end of input", value: 0, line, column });
  return tokens;
}
