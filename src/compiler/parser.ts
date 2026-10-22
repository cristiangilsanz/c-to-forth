import type {
  AssignOperator,
  BinaryOperator,
  Case,
  Declarator,
  Expr,
  FunctionDef,
  Param,
  PrintPart,
  Program,
  Stmt,
  Target,
  TopLevel,
} from "./ast";
import { type Position, fail } from "./errors";
import { type Token, tokenize } from "./lexer";

const LEVELS: BinaryOperator[][] = [
  ["||"],
  ["&&"],
  ["|"],
  ["^"],
  ["&"],
  ["==", "!="],
  ["<", ">", "<=", ">="],
  ["<<", ">>"],
  ["+", "-"],
  ["*", "/", "%"],
];
const ASSIGNMENTS = new Set<string>([
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "<<=",
  ">>=",
  "&=",
  "|=",
  "^=",
]);
const TYPES = new Set([
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
]);
const BUILTINS = new Set(["puts", "printf", "putchar"]);

export function constant(expr: Expr): number | undefined {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "unary": {
      const value = constant(expr.operand);
      if (value === undefined) return undefined;
      if (expr.operator === "-") return -value;
      if (expr.operator === "~") return ~value;
      return value === 0 ? 1 : 0;
    }
    case "ternary": {
      const condition = constant(expr.condition);
      if (condition === undefined) return undefined;
      return condition !== 0 ? constant(expr.then) : constant(expr.otherwise);
    }
    case "binary": {
      const left = constant(expr.left);
      const right = constant(expr.right);
      if (left === undefined || right === undefined) return undefined;
      const flag = (condition: boolean) => (condition ? 1 : 0);
      switch (expr.operator) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
        case "%":
          if (right === 0) fail("division by zero", expr.at);
          return expr.operator === "/" ? Math.trunc(left / right) : left % right;
        case "<<":
          return left * 2 ** right;
        case ">>":
          return Math.floor(left / 2 ** right);
        case "&":
          return left & right;
        case "|":
          return left | right;
        case "^":
          return left ^ right;
        case "<":
          return flag(left < right);
        case ">":
          return flag(left > right);
        case "<=":
          return flag(left <= right);
        case ">=":
          return flag(left >= right);
        case "==":
          return flag(left === right);
        case "!=":
          return flag(left !== right);
        case "&&":
          return flag(left !== 0 && right !== 0);
        case "||":
          return flag(left !== 0 || right !== 0);
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

function isString(arg: Expr | Token): arg is Token {
  return arg.kind === "string";
}

export function parse(source: string): Program {
  const tokens = tokenize(source);
  let index = 0;

  const peek = (offset = 0): Token => tokens[Math.min(index + offset, tokens.length - 1)];
  const next = (): Token => tokens[index++];
  const is = (text: string, offset = 0): boolean => {
    const token = peek(offset);
    return (token.kind === "symbol" || token.kind === "keyword") && token.text === text;
  };
  const accept = (text: string): boolean => {
    if (!is(text)) return false;
    index++;
    return true;
  };
  const describe = (token: Token): string =>
    token.kind === "end" ? "end of input" : `'${token.text}'`;
  const expect = (text: string): Token => {
    if (!is(text)) fail(`expected '${text}' but found ${describe(peek())}`, peek());
    return next();
  };
  const name = (): Token => {
    const token = peek();
    if (token.kind !== "name") fail(`expected a name but found ${describe(token)}`, token);
    return next();
  };
  const isType = (offset = 0): boolean =>
    peek(offset).kind === "keyword" && TYPES.has(peek(offset).text);
  const types = (): string[] => {
    const found: string[] = [];
    while (isType()) found.push(next().text);
    return found;
  };
  const constantOf = (expr: Expr, what: string): number => {
    const value = constant(expr);
    if (value === undefined) fail(`${what} must be a constant`, expr.at);
    return value;
  };

  const asTarget = (expr: Expr): Target => {
    if (expr.kind !== "variable" && expr.kind !== "index") fail("cannot assign to this", expr.at);
    return expr;
  };

  const primary = (): Expr => {
    const token = peek();
    if (token.kind === "number") {
      next();
      return { kind: "number", value: token.value, at: token };
    }
    if (is("(") && isType(1)) {
      next();
      types();
      expect(")");
      return unary();
    }
    if (accept("(")) {
      const inner = expression();
      expect(")");
      return inner;
    }
    if (token.kind === "string") fail("strings can only be used with puts and printf", token);
    const id = name();
    if (accept("(")) {
      const args: Expr[] = [];
      if (!is(")")) {
        do args.push(expression());
        while (accept(","));
      }
      expect(")");
      return { kind: "call", name: id.text, args, at: id };
    }
    if (accept("[")) {
      const position = expression();
      expect("]");
      return { kind: "index", name: id.text, index: position, at: id };
    }
    return { kind: "variable", name: id.text, at: id };
  };

  const postfix = (): Expr => {
    const expr = primary();
    const token = peek();
    if (accept("++") || accept("--")) {
      const delta = token.text === "++" ? 1 : -1;
      return { kind: "increment", target: asTarget(expr), delta, prefix: false, at: token };
    }
    return expr;
  };

  const unary = (): Expr => {
    const token = peek();
    for (const operator of ["-", "!", "~"] as const) {
      if (accept(operator)) return { kind: "unary", operator, operand: unary(), at: token };
    }
    if (accept("+")) return unary();
    if (accept("++") || accept("--")) {
      const delta = token.text === "++" ? 1 : -1;
      return { kind: "increment", target: asTarget(unary()), delta, prefix: true, at: token };
    }
    return postfix();
  };

  const binary = (level: number): Expr => {
    if (level === LEVELS.length) return unary();
    let left = binary(level + 1);
    for (;;) {
      const token = peek();
      const operator = LEVELS[level].find((candidate) => is(candidate));
      if (!operator) return left;
      next();
      left = { kind: "binary", operator, left, right: binary(level + 1), at: token };
    }
  };

  const ternary = (): Expr => {
    const condition = binary(0);
    const token = peek();
    if (!accept("?")) return condition;
    const then = expression();
    expect(":");
    return { kind: "ternary", condition, then, otherwise: ternary(), at: token };
  };

  const expression = (): Expr => {
    const left = ternary();
    const token = peek();
    if (token.kind === "symbol" && ASSIGNMENTS.has(token.text)) {
      next();
      return {
        kind: "assign",
        operator: token.text as AssignOperator,
        target: asTarget(left),
        value: expression(),
        at: token,
      };
    }
    return left;
  };

  const printArgs = (): (Expr | Token)[] => {
    expect("(");
    const args: (Expr | Token)[] = [];
    do args.push(peek().kind === "string" ? next() : expression());
    while (accept(","));
    expect(")");
    return args;
  };

  const textParts = (value: string): PrintPart[] =>
    value
      .split("\n")
      .flatMap((piece, i): PrintPart[] => [
        ...(i > 0 ? [{ kind: "newline" } as const] : []),
        ...(piece ? [{ kind: "text", text: piece } as const] : []),
      ]);

  const printf = (at: Position): Stmt => {
    const args = printArgs();
    const parts: PrintPart[] = [];
    const [format, ...values] = args;
    if (!isString(format)) {
      for (const arg of args) {
        if (isString(arg)) parts.push(...textParts(arg.text));
        else parts.push({ kind: "number", value: arg });
      }
      return { kind: "print", parts, at };
    }
    const pieces = format.text.split(/(%[-+ 0#]*\d*(?:hh|h|ll|l|z)?[a-zA-Z%])/);
    for (const piece of pieces) {
      const spec = /^%([-+ 0#]*)(\d*)(?:hh|h|ll|l|z)?([a-zA-Z%])$/.exec(piece);
      if (!spec) {
        parts.push(...textParts(piece));
        continue;
      }
      const [, flags, width, conversion] = spec;
      if (conversion === "%") {
        parts.push({ kind: "text", text: "%" });
        continue;
      }
      if (flags || !"diucs".includes(conversion)) fail(`printf does not support ${piece}`, format);
      const value = values.shift();
      if (!value) fail(`printf needs a value for ${piece}`, format);
      if (conversion === "s") {
        if (!isString(value)) fail("%s needs a string literal", value.at);
        parts.push(...textParts(value.text));
      } else if (isString(value)) {
        fail(`${piece} needs a number`, value);
      } else if (conversion === "c") {
        parts.push({ kind: "char", value });
      } else {
        parts.push({ kind: "number", value, width: width ? Number(width) : undefined });
      }
    }
    return { kind: "print", parts, at };
  };

  const builtin = (id: Token): Stmt => {
    if (id.text === "printf") return printf(id);
    const args = printArgs();
    if (args.length !== 1) fail(`${id.text} expects one argument`, id);
    const [arg] = args;
    if (id.text === "puts") {
      if (!isString(arg)) fail("puts expects a string", arg.at);
      return { kind: "print", parts: [...textParts(arg.text), { kind: "newline" }], at: id };
    }
    if (isString(arg)) fail("putchar expects a character", arg);
    return { kind: "print", parts: [{ kind: "char", value: arg }], at: id };
  };

  const declarators = (): Declarator[] => {
    const list: Declarator[] = [];
    do {
      const id = name();
      const declarator: Declarator = { name: id.text, at: id };
      if (accept("[")) {
        if (!is("]")) {
          const size = expression();
          declarator.size = constantOf(size, "array size");
          if (declarator.size < 1) fail("array size must be positive", size.at);
        }
        expect("]");
        if (accept("=")) {
          const brace = expect("{");
          const values: Expr[] = [];
          while (!is("}")) {
            values.push(expression());
            if (!accept(",")) break;
          }
          expect("}");
          if (values.length === 0) fail("empty array initializer", brace);
          declarator.size ??= values.length;
          if (values.length > declarator.size) fail("too many values for the array", brace);
          declarator.values = values;
        }
        if (declarator.size === undefined) fail("array size is missing", id);
      } else if (accept("=")) {
        declarator.init = expression();
      }
      list.push(declarator);
    } while (accept(","));
    return list;
  };

  const declaration = (at: Position): Stmt => {
    const found = types();
    if (found.includes("void")) fail("variables cannot be void", at);
    return { kind: "declare", declarators: declarators(), at };
  };

  const simple = (): Stmt => {
    const at = peek();
    if (isType()) return declaration(at);
    if (peek().kind === "name" && BUILTINS.has(peek().text) && is("(", 1)) return builtin(next());
    return { kind: "expression", expr: expression(), at };
  };

  const block = (at: Position): Stmt[] => {
    const body: Stmt[] = [];
    while (!accept("}")) {
      if (peek().kind === "end") fail("missing closing '}'", at);
      body.push(statement());
    }
    return body;
  };

  const switchBody = (at: Position): Case[] => {
    expect("{");
    const cases: Case[] = [];
    while (!accept("}")) {
      const token = peek();
      if (token.kind === "end") fail("missing closing '}'", at);
      if (accept("case")) {
        const label = constantOf(expression(), "case label");
        expect(":");
        const last = cases.at(-1);
        if (last && last.body.length === 0) last.labels.push(label);
        else cases.push({ labels: [label], isDefault: false, body: [], at: token });
      } else if (accept("default")) {
        expect(":");
        const last = cases.at(-1);
        if (last && last.body.length === 0) last.isDefault = true;
        else cases.push({ labels: [], isDefault: true, body: [], at: token });
      } else {
        const current = cases.at(-1);
        if (!current) fail("expected 'case' or 'default'", token);
        current.body.push(statement());
      }
    }
    return cases;
  };

  const condition = (): Expr => {
    expect("(");
    const value = expression();
    expect(")");
    return value;
  };

  const statement = (): Stmt => {
    const at = peek();
    if (accept("{")) return { kind: "block", body: block(at), at };
    if (accept(";")) return { kind: "block", body: [], at };
    if (accept("if")) {
      const test = condition();
      const then = statement();
      const otherwise = accept("else") ? statement() : undefined;
      return { kind: "if", condition: test, then, otherwise, at };
    }
    if (accept("while")) {
      const test = condition();
      return { kind: "while", condition: test, body: statement(), at };
    }
    if (accept("do")) {
      const body = statement();
      expect("while");
      const test = condition();
      expect(";");
      return { kind: "do", body, condition: test, at };
    }
    if (accept("for")) {
      expect("(");
      const init: Stmt[] = [];
      if (isType()) init.push(declaration(peek()));
      else if (!is(";")) {
        do init.push({ kind: "expression", expr: expression(), at: peek() });
        while (accept(","));
      }
      expect(";");
      const test = is(";") ? undefined : expression();
      expect(";");
      const step: Expr[] = [];
      if (!is(")")) {
        do step.push(expression());
        while (accept(","));
      }
      expect(")");
      return { kind: "for", init, condition: test, step, body: statement(), at };
    }
    if (accept("switch")) {
      const value = condition();
      return { kind: "switch", value, cases: switchBody(at), at };
    }
    if (accept("break")) {
      expect(";");
      return { kind: "break", at };
    }
    if (accept("continue")) {
      expect(";");
      return { kind: "continue", at };
    }
    if (accept("return")) {
      const value = is(";") ? undefined : expression();
      expect(";");
      return { kind: "return", value, at };
    }
    if (is("case") || is("default")) fail(`'${peek().text}' outside of a switch`, at);
    if (peek().kind === "embed") fail("embedded Lisp is only allowed between functions", at);
    const result = simple();
    expect(";");
    return result;
  };

  const functionDef = (returns: FunctionDef["returns"], id: Token): FunctionDef => {
    expect("(");
    const params: Param[] = [];
    if (is("void") && is(")", 1)) next();
    else if (!is(")")) {
      do {
        const start = peek();
        const found = types();
        if (found.length === 0 && returns !== "implicit") fail("expected a parameter type", start);
        const param = peek().kind === "name" ? next() : undefined;
        const array = accept("[");
        if (array) {
          if (!is("]")) expression();
          expect("]");
        }
        params.push({ name: param?.text ?? "", array, at: param ?? start });
      } while (accept(","));
    }
    expect(")");
    if (accept(";")) return { kind: "function", name: id.text, returns, params, at: id };
    const open = expect("{");
    const unnamed = params.find((param) => !param.name);
    if (unnamed) fail("parameters need names", unnamed.at);
    return { kind: "function", name: id.text, returns, params, body: block(open), at: id };
  };

  const topLevel = (): TopLevel => {
    const token = peek();
    if (token.kind === "embed") {
      next();
      return { kind: "embed", text: token.text, at: token };
    }
    if (isType()) {
      const found = types();
      const id = peek();
      if (id.kind === "name" && is("(", 1)) {
        next();
        return functionDef(found.includes("void") ? "void" : "int", id);
      }
      if (found.includes("void")) fail("variables cannot be void", token);
      const list = declarators();
      expect(";");
      return { kind: "declare", declarators: list, at: token };
    }
    const id = name();
    if (!is("(")) fail(`expected '(' after '${id.text}'`, peek());
    return functionDef("implicit", id);
  };

  const items: TopLevel[] = [];
  while (peek().kind !== "end") items.push(topLevel());
  return { items };
}
