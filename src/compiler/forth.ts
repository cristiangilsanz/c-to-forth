import { type Position, fail } from "./errors";
import { GFORTH_WORDS } from "./reserved";
import { type SExpr, head, isChar, isStr, isSym, read, sym } from "./sexpr";

const RESERVED = new Set([
  "again",
  "allot",
  "and",
  "ash",
  "base",
  "begin",
  "bye",
  "case",
  "cells",
  "constant",
  "cr",
  "create",
  "decimal",
  "defer",
  "do",
  "drop",
  "dup",
  "else",
  "emit",
  "endcase",
  "endof",
  "erase",
  "execute",
  "exit",
  "expt",
  "false",
  "gcd",
  "here",
  "i",
  "if",
  "invert",
  "is",
  "j",
  "k",
  "leave",
  "loop",
  "lshift",
  "max",
  "min",
  "mod",
  "negate",
  "nip",
  "of",
  "or",
  "over",
  "quot",
  "recurse",
  "rem",
  "repeat",
  "rot",
  "space",
  "swap",
  "then",
  "to",
  "true",
  "tuck",
  "type",
  "unloop",
  "until",
  "value",
  "variable",
  "while",
  "xor",
]);

const HELPERS: Record<string, string> = {
  quot: ": quot >r s>d r> sm/rem nip ;",
  rem: ": rem >r s>d r> sm/rem drop ;",
  ash: ": ash dup 0< if negate 1 swap lshift / else lshift then ;",
  expt: ": expt 1 swap 0 ?do over * loop nip ;",
  gcd: ": gcd begin dup while tuck mod repeat drop abs ;",
};

const VARIADIC: Record<string, string> = {
  "+": "+",
  "*": "*",
  logand: "and",
  logior: "or",
  logxor: "xor",
  max: "max",
  min: "min",
};

const COMPARISONS: Record<string, string> = {
  "=": "=",
  "/=": "<>",
  "<": "<",
  ">": ">",
  "<=": "> 0=",
  ">=": "< 0=",
};

const UNARY: Record<string, string> = {
  "1+": "1+",
  "1-": "1-",
  abs: "abs",
  lognot: "invert",
  not: "0=",
  null: "0=",
  zerop: "0=",
  plusp: "0>",
  minusp: "0<",
  evenp: "1 and 0=",
  oddp: "1 and 0<>",
  "code-char": "",
  "char-code": "",
  values: "",
  identity: "",
};

const PREDICATES = new Set([
  "=",
  "/=",
  "<",
  ">",
  "<=",
  ">=",
  "not",
  "null",
  "zerop",
  "plusp",
  "minusp",
  "evenp",
  "oddp",
]);

const STATEMENTS = new Set([
  "setf",
  "setq",
  "incf",
  "decf",
  "format",
  "when",
  "unless",
  "loop",
  "dotimes",
  "block",
  "return",
  "return-from",
  "terpri",
  "write-char",
  "write-string",
  "write-line",
  "case",
  "cond",
  "print",
  "princ",
  "prin1",
]);

const CONTROL =
  /(^|\s)(if|else|then|begin|while|repeat|until|again|\?do|do|loop|\+loop|leave|unloop|case|of|endof|endcase|exit|recurse|i|j|k|\.")(\s|$)/;
const RESTORE = "\u0001restore";

interface Line {
  depth: number;
  text: string;
}

interface Block {
  name: string;
  kind: "do" | "begin" | "block";
  flag?: Variable;
  doDepth: number;
}

interface Code {
  lines: Line[];
  escapes: Set<Block>;
}

interface Variable {
  forth: string;
  kind: "value" | "array" | "index";
  size?: number;
  doDepth?: number;
}

interface Callable {
  name: string;
  forth: string;
  arity: number;
  index: number;
  returnsValue: boolean;
  recursive: boolean;
  deferred: boolean;
  form: SExpr[];
}

interface Context {
  prefix: string;
  self?: Callable;
  declarations: string[];
  scalars: Variable[];
  used: Set<string>;
  scopes: Map<string, Variable>[];
  blocks: Block[];
  doDepth: number;
}

type Mode = "value" | "effect";

function where(form: SExpr | undefined): Position {
  if (Array.isArray(form)) {
    for (const item of form) {
      const at = where(item);
      if (at.line > 0) return at;
    }
  } else if (isSym(form) && form.at) {
    return form.at;
  }
  return { line: 0, column: 0 };
}

function forthName(name: string): string {
  return RESERVED.has(name) || GFORTH_WORDS.has(name) ? `${name}_` : name;
}

function symbolName(form: SExpr | undefined, what: string): string {
  if (!isSym(form)) fail(`expected ${what}`, where(form));
  return form.name;
}

const empty = (): Code => ({ lines: [], escapes: new Set() });

const words = (text: string): Code => ({
  lines: text ? [{ depth: 0, text }] : [],
  escapes: new Set(),
});

function inline(code: Code): string | undefined {
  return code.lines.length === 1 && code.lines[0].depth === 0 ? code.lines[0].text : undefined;
}

function join(...parts: (Code | string)[]): Code {
  const result = empty();
  for (const part of parts) {
    const code = typeof part === "string" ? words(part) : part;
    for (const target of code.escapes) result.escapes.add(target);
    code.lines.forEach((line, i) => {
      const previous = result.lines[result.lines.length - 1];
      if (i === 0 && previous && previous.depth === 0 && line.depth === 0) {
        previous.text = `${previous.text} ${line.text}`;
      } else {
        result.lines.push({ ...line });
      }
    });
  }
  return result;
}

function stack(...parts: Code[]): Code {
  const result = empty();
  for (const code of parts) {
    for (const target of code.escapes) result.escapes.add(target);
    result.lines.push(...code.lines.map((line) => ({ ...line })));
  }
  return result;
}

function indent(code: Code): Code {
  return {
    lines: code.lines.map((line) => ({ ...line, depth: line.depth + 1 })),
    escapes: code.escapes,
  };
}

function structure(header: Code | string, body: Code, footer: string): Code {
  const start = typeof header === "string" ? words(header) : header;
  const startText = inline(start);
  const bodyText = inline(body);
  if (startText !== undefined && bodyText !== undefined) {
    const short = `${startText} ${bodyText} ${footer}`;
    if (short.length <= 60) {
      return {
        lines: [{ depth: 0, text: short }],
        escapes: new Set([...start.escapes, ...body.escapes]),
      };
    }
  }
  if (body.lines.length === 0 && startText !== undefined) {
    return { lines: [{ depth: 0, text: `${startText} ${footer}` }], escapes: start.escapes };
  }
  return stack(start, indent(body), words(footer));
}

function hasControl(code: Code): boolean {
  return code.lines.length > 1 || code.lines.some((line) => CONTROL.test(line.text));
}

function containsForm(form: SExpr, test: (list: SExpr[]) => boolean): boolean {
  return Array.isArray(form) && (test(form) || form.some((item) => containsForm(item, test)));
}

function bodyForms(form: SExpr[]): { params: SExpr[]; body: SExpr[] } {
  const [, , params, ...rest] = form;
  const body = rest.filter(
    (item, i) => !(head(item) === "declare" || (i === 0 && isStr(item) && rest.length > 1)),
  );
  return { params: params as SExpr[], body };
}

const SPECIAL_FORMS = new Set([
  "quote",
  "function",
  "declare",
  "progn",
  "prog1",
  "block",
  "when",
  "unless",
  "if",
  "let",
  "let*",
  "dotimes",
  "loop",
  "cond",
  "case",
  "return-from",
]);

function parts(form: SExpr[], mode: Mode): [SExpr, Mode][] {
  const name = head(form);
  const args = form.slice(1);
  const sequence = (forms: SExpr[], last: Mode): [SExpr, Mode][] =>
    forms.map((item, i) => [item, i === forms.length - 1 ? last : "effect"]);
  const values = (forms: SExpr[]): [SExpr, Mode][] => forms.map((item) => [item, "value"]);
  switch (name) {
    case "quote":
    case "function":
    case "declare":
      return [];
    case "progn":
      return sequence(args, mode);
    case "prog1":
      return args.map((item, i) => [item, i === 0 ? mode : "effect"]);
    case "block":
      return sequence(args.slice(1), mode);
    case "when":
    case "unless":
      return [[args[0], "value"], ...sequence(args.slice(1), mode)];
    case "if":
      return [[args[0], "value"], ...args.slice(1).map((item): [SExpr, Mode] => [item, mode])];
    case "let":
    case "let*": {
      const bindings = Array.isArray(args[0]) ? args[0] : [];
      const inits = bindings.flatMap((binding) =>
        Array.isArray(binding) && binding.length > 1 ? [binding[1]] : [],
      );
      return [...values(inits), ...sequence(args.slice(1), mode)];
    }
    case "dotimes":
      return [
        ...values(Array.isArray(args[0]) ? args[0].slice(1) : []),
        ...sequence(args.slice(1), "effect"),
      ];
    case "loop": {
      let keyword = "";
      const result: [SExpr, Mode][] = [];
      for (const item of args) {
        if (isSym(item)) keyword = item.name;
        else result.push([item, keyword === "do" ? "effect" : "value"]);
      }
      return result;
    }
    case "cond":
      return args.flatMap((clause): [SExpr, Mode][] =>
        Array.isArray(clause) ? [[clause[0], "value"], ...sequence(clause.slice(1), mode)] : [],
      );
    case "case":
      return [
        [args[0], "value"],
        ...args
          .slice(1)
          .flatMap((clause) => (Array.isArray(clause) ? sequence(clause.slice(1), mode) : [])),
      ];
    case "return-from":
      return values(args.slice(1));
    default:
      return values(args);
  }
}

function walk(form: SExpr, mode: Mode, visit: (name: string, mode: Mode) => void): void {
  if (!Array.isArray(form) || form.length === 0) return;
  const name = head(form);
  if (name !== undefined && !SPECIAL_FORMS.has(name)) visit(name, mode);
  for (const [child, childMode] of parts(form, mode)) walk(child, childMode, visit);
}

export function toForth(source: string): string {
  const forms = read(source);
  const functions = new Map<string, Callable>();
  const globals = new Map<string, Variable>();
  const helpers = new Set<string>();
  const laterGlobals = new Set<string>();

  forms.forEach((form, index) => {
    if (!Array.isArray(form)) return;
    if (["setq", "defvar", "defparameter", "defconstant"].includes(head(form) ?? "")) {
      if (isSym(form[1])) laterGlobals.add(form[1].name);
    }
    if (head(form) !== "defun") return;
    const name = symbolName(form[1], "a function name");
    const params = form[2];
    if (!Array.isArray(params)) fail("expected a parameter list", where(form));
    if (params.some((param) => !isSym(param) || param.name.startsWith("&"))) {
      fail("only plain parameters are supported", where(params));
    }
    if (functions.has(name)) fail(`'${name}' is defined twice`, where(form[1]));
    functions.set(name, {
      name,
      forth: forthName(name),
      arity: params.length,
      index,
      returnsValue: false,
      recursive: false,
      deferred: false,
      form,
    });
  });

  const lastIsValue = (body: SExpr[]): boolean => {
    const last = body[body.length - 1];
    if (last === undefined) return false;
    if (!Array.isArray(last)) return !isSym(last, "nil");
    const name = head(last) ?? "";
    if (name === "progn") return lastIsValue(last.slice(1));
    if (name === "let" || name === "let*") return lastIsValue(last.slice(2));
    if (name === "if") return last.length === 4 && lastIsValue([last[2]]) && lastIsValue([last[3]]);
    const callee = functions.get(name);
    if (callee) return callee.returnsValue;
    return !STATEMENTS.has(name);
  };

  for (let changed = true; changed; ) {
    changed = false;
    const mark = (name: string, mode: Mode) => {
      const callee = functions.get(name);
      if (mode === "value" && callee && !callee.returnsValue) {
        callee.returnsValue = true;
        changed = true;
      }
    };
    for (const fn of functions.values()) {
      const { body } = bodyForms(fn.form);
      const returnsFrom = body.some((item) =>
        containsForm(
          item,
          (list) => head(list) === "return-from" && isSym(list[1], fn.name) && list.length > 2,
        ),
      );
      if (returnsFrom || lastIsValue(body)) mark(fn.name, "value");
      body.forEach((item, i) =>
        walk(item, i === body.length - 1 && fn.returnsValue ? "value" : "effect", mark),
      );
    }
    for (const form of forms) if (head(form) !== "defun") walk(form, "effect", mark);
  }

  const booleans = new Set<string>();
  const isBoolean = (form: SExpr | undefined): boolean => {
    if (form === undefined) return false;
    if (isSym(form, "t") || isSym(form, "nil")) return true;
    const name = head(form) ?? "";
    if (!Array.isArray(form)) return false;
    if (PREDICATES.has(name) || booleans.has(name)) return true;
    if (name === "and" || name === "or") return form.slice(1).every(isBoolean);
    if (name === "progn") return isBoolean(form[form.length - 1]);
    if (name === "let" || name === "let*") return isBoolean(form[form.length - 1]);
    if (name === "if") return isBoolean(form[2]) && (form[3] === undefined || isBoolean(form[3]));
    return false;
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const fn of functions.values()) {
      const { body } = bodyForms(fn.form);
      if (fn.returnsValue && !booleans.has(fn.name) && isBoolean(body[body.length - 1])) {
        booleans.add(fn.name);
        changed = true;
      }
    }
  }

  const calls = new Map<string, Set<string>>();
  for (const fn of functions.values()) {
    const found = new Set<string>();
    containsForm(fn.form.slice(3), (list) => {
      const name = head(list);
      if (name && functions.has(name)) found.add(name);
      return false;
    });
    calls.set(fn.name, found);
  }
  for (const fn of functions.values()) {
    const seen = new Set<string>();
    const pending = [...(calls.get(fn.name) ?? [])];
    while (pending.length) {
      const next = pending.pop() as string;
      if (next === fn.name) fn.recursive = true;
      if (seen.has(next)) continue;
      seen.add(next);
      pending.push(...(calls.get(next) ?? []));
    }
    for (const callee of calls.get(fn.name) ?? []) {
      const target = functions.get(callee) as Callable;
      if (target.index > fn.index) target.deferred = true;
    }
  }

  const compileBody = (context: Context, body: SExpr[], mode: Mode): Code => {
    const allocate = (base: string, kind: Variable["kind"] = "value", size?: number): Variable => {
      let forth = `${context.prefix}.${base}`;
      for (let n = 2; context.used.has(forth) || GFORTH_WORDS.has(forth); n++) {
        forth = `${context.prefix}.${base}${n}`;
      }
      context.used.add(forth);
      const variable: Variable = { forth, kind, size };
      if (kind === "value") {
        context.declarations.push(`0 value ${forth}`);
        context.scalars.push(variable);
      } else if (kind === "array") {
        context.declarations.push(`create ${forth} ${size} cells allot`);
      }
      return variable;
    };

    const bind = (name: string, variable: Variable) => {
      context.scopes[context.scopes.length - 1].set(name, variable);
    };

    const resolve = (form: SExpr): Variable => {
      const name = symbolName(form, "a variable");
      for (let i = context.scopes.length - 1; i >= 0; i--) {
        const variable = context.scopes[i].get(name);
        if (variable) return variable;
      }
      const global = globals.get(name);
      if (global) return global;
      if (laterGlobals.has(name))
        fail(`define '${name}' before the code that uses it`, where(form));
      fail(`unknown variable '${name}'`, where(form));
    };

    const reference = (variable: Variable, at: SExpr): string => {
      if (variable.kind !== "index") return variable.forth;
      const word = ["i", "j", "k"][context.doDepth - (variable.doDepth ?? 0)];
      if (!word) fail("loop counters can only be read three loops deep", where(at));
      return word;
    };

    const typeOf = (form: SExpr): "bool" | "number" | "char" | "string" | "unknown" => {
      if (typeof form === "number") return "number";
      if (isSym(form, "t") || isSym(form, "nil")) return "bool";
      if (isStr(form)) return "string";
      if (isChar(form)) return "char";
      const name = head(form);
      if (name === undefined || !Array.isArray(form)) return "unknown";
      if (PREDICATES.has(name) || booleans.has(name)) return "bool";
      if (name === "and" || name === "or") {
        return form.slice(1).every((item) => typeOf(item) === "bool") ? "bool" : "unknown";
      }
      if (name === "code-char") return "char";
      if (
        name in VARIADIC ||
        ["-", "truncate", "floor", "mod", "rem", "ash", "1+", "1-"].includes(name)
      ) {
        return "number";
      }
      return "unknown";
    };

    const single = (code: Code, at: SExpr): string => {
      const text = inline(code);
      if (text === undefined) fail("this expression is too complex here", where(at));
      return text;
    };

    const cell = (array: SExpr, index: SExpr): Code =>
      join(reference(resolve(array), array), value(index), "cells +");

    const call = (list: SExpr[], mode: Mode): Code => {
      const callee = symbolName(list[0], "a function");
      const target = functions.get(callee);
      if (!target) fail(`unknown function '${callee}'`, where(list));
      if (list.length - 1 !== target.arity) {
        fail(`'${callee}' expects ${target.arity} argument(s)`, where(list));
      }
      const word = context.self === target ? "recurse" : target.forth;
      const code = join(...list.slice(1).map(value), word);
      if (mode === "effect") return target.returnsValue ? join(code, "drop") : code;
      return target.returnsValue ? code : join(code, "false");
    };

    const text = (content: string): string[] => {
      const result: string[] = [];
      content.split("\n").forEach((line, i) => {
        if (i > 0) result.push("cr");
        line.split('"').forEach((piece, j) => {
          if (j > 0) result.push("34 emit");
          if (piece) result.push(`." ${piece}"`);
        });
      });
      return result;
    };

    const show = (form: SExpr, readably: boolean, width = 0): Code => {
      if (isStr(form)) {
        const body = text(form.value);
        return words((readably ? ["34 emit", ...body, "34 emit"] : body).join(" "));
      }
      if (isChar(form)) {
        if (readably)
          return words(text(`#\\${form.value === " " ? "Space" : form.value}`).join(" "));
        return words(`${form.value.charCodeAt(0)} emit`);
      }
      const type = typeOf(form);
      if (type === "char") return join(value(form), "emit");
      if (type === "bool") return join(value(form), 'if ." T" else ." NIL" then');
      return join(value(form), `${width} .r`);
    };

    const printing = (args: SExpr[]): Code => {
      const [destination, pattern, ...values] = args;
      if (!isSym(destination, "t")) fail("format needs t as its destination", where(args));
      if (!isStr(pattern)) fail("format needs a literal control string", where(args));
      const parts: Code[] = [];
      let buffer = "";
      const flush = () => {
        if (buffer) parts.push(words(text(buffer).join(" ")));
        buffer = "";
      };
      const control = pattern.value;
      for (let i = 0; i < control.length; i++) {
        if (control[i] !== "~") {
          buffer += control[i];
          continue;
        }
        let prefix = "";
        while (/\d/.test(control[i + 1] ?? "")) prefix += control[++i];
        const directive = (control[++i] ?? "").toLowerCase();
        if (directive === "~" || directive === "%") {
          buffer += directive === "~" ? "~" : "\n";
          continue;
        }
        flush();
        if (!directive || !"adsc".includes(directive)) {
          fail(`format directive ~${directive} is not supported`, where(args));
        }
        const argument = values.shift();
        if (argument === undefined) fail("format needs more arguments", where(args));
        parts.push(show(argument, directive === "s", prefix ? Number(prefix) : 0));
      }
      flush();
      return join(...parts);
    };

    const flagOf = (block: Block): Variable => {
      block.flag ??= allocate(block.name === "nil" ? "break" : block.name);
      return block.flag;
    };

    const escapeTest = (escapes: Set<Block>): string =>
      [...escapes]
        .map((block, i) => `${(block.flag as Variable).forth}${i > 0 ? " or" : ""}`)
        .join(" ");

    const sequence = (forms: SExpr[], mode: Mode): Code => {
      const compiled: Code[] = [];
      for (let i = 0; i < forms.length; i++) {
        const last = i === forms.length - 1;
        const code = compile(forms[i], last ? mode : "effect");
        compiled.push(code);
        if (!last && code.escapes.size > 0) {
          const rest = sequence(forms.slice(i + 1), mode);
          if (rest.lines.length > 0) {
            compiled.push(structure(`${escapeTest(code.escapes)} 0= if`, rest, "then"));
          }
          return stack(...compiled);
        }
      }
      if (forms.length === 0 && mode === "value") compiled.push(words("false"));
      return stack(...compiled);
    };

    const scoped = (run: () => Code): Code => {
      context.scopes.push(new Map());
      try {
        return run();
      } finally {
        context.scopes.pop();
      }
    };

    const withBlock = (block: Block, run: () => Code): Code => {
      context.blocks.push(block);
      try {
        const code = run();
        code.escapes.delete(block);
        return code;
      } finally {
        context.blocks.pop();
      }
    };

    const arraySize = (init: SExpr): number | undefined => {
      if (head(init) === "vector" && Array.isArray(init)) return init.length - 1;
      if (head(init) === "make-array" && Array.isArray(init) && typeof init[1] === "number") {
        return init[1];
      }
      return undefined;
    };

    const initArray = (variable: Variable, init: SExpr[]): Code => {
      const size = variable.size as number;
      if (head(init) === "vector") {
        return stack(
          ...init
            .slice(1)
            .map((item, i) => join(value(item), variable.forth, i === 0 ? "!" : `${i} cells + !`)),
        );
      }
      const keywords = init.slice(2);
      const at = keywords.findIndex((item) => isSym(item, ":initial-element"));
      const initial = at >= 0 ? keywords[at + 1] : 0;
      if (initial === 0 || initial === undefined || isSym(initial, "nil")) {
        return words(`${variable.forth} ${size} cells erase`);
      }
      return structure(
        `${size} 0 ?do`,
        join(value(initial), variable.forth, "i cells + !"),
        "loop",
      );
    };

    const letForm = (list: SExpr[], mode: Mode, sequential: boolean): Code => {
      const [, bindings, ...body] = list;
      if (!Array.isArray(bindings)) fail("expected bindings", where(list));
      const parsed = bindings.map((binding) => {
        const [name, init] = Array.isArray(binding) ? binding : [binding, undefined];
        return { name: symbolName(name, "a variable name"), init: init ?? sym("nil") };
      });
      return scoped(() => {
        const inits: Code[] = [];
        const pending: { name: string; variable: Variable }[] = [];
        for (const { name, init } of parsed) {
          const size = arraySize(init);
          const variable = size !== undefined ? allocate(name, "array", size) : allocate(name);
          inits.push(
            size !== undefined
              ? initArray(variable, init as SExpr[])
              : join(value(init), `to ${variable.forth}`),
          );
          if (sequential) bind(name, variable);
          else pending.push({ name, variable });
        }
        for (const { name, variable } of pending) bind(name, variable);
        return stack(...inits, sequence(body, mode));
      });
    };

    const doLoop = (
      header: string,
      counter: string | undefined,
      body: SExpr[],
      mode: Mode,
      footer = "loop",
    ): Code => {
      const block: Block = { name: "nil", kind: "do", doDepth: context.doDepth + 1 };
      const code = withBlock(block, () =>
        scoped(() => {
          context.doDepth++;
          try {
            let prefix = empty();
            if (counter !== undefined) {
              const written = body.some((item) =>
                containsForm(
                  item,
                  (list) =>
                    ["setf", "setq", "incf", "decf"].includes(head(list) ?? "") &&
                    isSym(list[1], counter),
                ),
              );
              if (written) {
                const variable = allocate(counter);
                bind(counter, variable);
                prefix = words(`i to ${variable.forth}`);
              } else {
                bind(counter, { forth: counter, kind: "index", doDepth: context.doDepth });
              }
            }
            return structure(header, stack(prefix, sequence(body, "effect")), footer);
          } finally {
            context.doDepth--;
          }
        }),
      );
      return mode === "value" ? stack(code, words("false")) : code;
    };

    const breakTest = (form: SExpr): SExpr | undefined => {
      const name = head(form);
      if (!Array.isArray(form) || form.length !== 3) return undefined;
      const isBreak = (item: SExpr) =>
        head(item) === "return" && Array.isArray(item) && item.length === 1;
      if ((name === "when" || name === "if") && isBreak(form[2])) return [sym("not"), form[1]];
      if (name === "unless" && isBreak(form[2])) return form[1];
      return undefined;
    };

    const accumulate = (list: SExpr[]): SExpr | undefined => {
      const kinds: Record<string, string> = {
        sum: "sum",
        summing: "sum",
        count: "count",
        counting: "count",
        maximize: "maximize",
        maximizing: "maximize",
        minimize: "minimize",
        minimizing: "minimize",
      };
      const args = list.slice(1);
      const found = args
        .filter((item) => isSym(item) && item.name in kinds)
        .map((item) => kinds[(item as { name: string }).name]);
      if (found.length === 0) return undefined;
      if (new Set(found).size > 1)
        fail("a loop can only use one kind of accumulation in Forth", where(list));
      const [kind] = found;
      const total = sym("loop-total");
      const seen = sym("loop-seen");
      const rewritten: SExpr[] = [list[0]];
      for (let i = 0; i < args.length; i++) {
        const item = args[i];
        if (!(isSym(item) && item.name in kinds)) {
          rewritten.push(item);
          continue;
        }
        const operand = args[++i];
        let step: SExpr;
        if (kind === "sum") step = [sym("incf"), total, operand];
        else if (kind === "count") step = [sym("when"), operand, [sym("incf"), total]];
        else {
          const better = [sym(kind === "maximize" ? ">" : "<"), operand, total];
          step = [
            sym("when"),
            [sym("or"), [sym("not"), seen], better],
            [sym("setq"), total, operand, seen, sym("t")],
          ];
        }
        rewritten.push(sym("do"), step);
      }
      const bindings: SExpr[] = [[total, 0]];
      if (kind === "maximize" || kind === "minimize") bindings.push([seen, sym("nil")]);
      return [sym("let"), bindings, rewritten, total];
    };

    const bodyClauses = (args: SExpr[], at: SExpr[]): SExpr[] => {
      const forms: SExpr[] = [];
      for (let i = 0; i < args.length; ) {
        const keyword = symbolName(args[i], "a loop keyword");
        if (keyword === "do" || keyword === "doing") {
          i++;
          while (i < args.length && !isSym(args[i])) forms.push(args[i++]);
        } else if (keyword === "while" || keyword === "until") {
          const test = args[i + 1];
          forms.push([sym(keyword === "while" ? "unless" : "when"), test, [sym("return")]]);
          i += 2;
        } else {
          fail(`loop ${keyword} is not supported in Forth`, where(at));
        }
      }
      return forms;
    };

    const loopForm = (list: SExpr[], mode: Mode): Code => {
      const args = list.slice(1);
      if (args.length > 0 && !isSym(args[0])) return loopForm([list[0], sym("do"), ...args], mode);
      const accumulated = accumulate(list);
      if (accumulated) return compile(accumulated, mode);
      if (isSym(args[0], "for")) {
        const counter = symbolName(args[1], "a loop variable");
        let from: SExpr = 0;
        let to: SExpr | undefined;
        let inclusive = false;
        let down = false;
        let step: SExpr = 1;
        let i = 2;
        const clauseWords = ["do", "doing", "while", "until"];
        for (
          ;
          i < args.length && !clauseWords.includes((args[i] as { name?: string }).name ?? "");
          i += 2
        ) {
          const keyword = symbolName(args[i], "a loop keyword");
          if (keyword === "from" || keyword === "upfrom") from = args[i + 1];
          else if (keyword === "downfrom") {
            from = args[i + 1];
            down = true;
          } else if (keyword === "to" || keyword === "upto" || keyword === "downto") {
            to = args[i + 1];
            inclusive = true;
            down ||= keyword === "downto";
          } else if (keyword === "below" || keyword === "above") {
            to = args[i + 1];
            down ||= keyword === "above";
          } else if (keyword === "by") step = args[i + 1];
          else fail(`loop ${keyword} is not supported in Forth`, where(args[i]));
        }
        if (to === undefined) fail("loop for needs an end in Forth", where(list));
        if (typeof step !== "number" || step < 1)
          fail("loop by needs a positive number", where(list));
        if (down) {
          const simple = (form: SExpr) => typeof form === "number" || isSym(form);
          if (!simple(from) || !simple(to))
            fail("loop downto needs simple bounds in Forth", where(list));
          const last = inclusive
            ? value(to)
            : typeof to === "number"
              ? words(String(to + 1))
              : join(value(to), "1+");
          const body = bodyClauses(args.slice(i), list);
          const loopCode = doLoop(
            single(join(last, value(from), "do"), list),
            counter,
            body,
            "effect",
            `-${step} +loop`,
          );
          const guarded =
            typeof from === "number" && typeof to === "number"
              ? from >= (inclusive ? to : to + 1)
                ? loopCode
                : empty()
              : structure(join(value(from), last, "< 0= if"), loopCode, "then");
          return mode === "value" ? stack(guarded, words("false")) : guarded;
        }
        const end = !inclusive
          ? value(to)
          : typeof to === "number"
            ? words(String(to + 1))
            : join(value(to), "1+");
        const literal = (form: SExpr) => typeof form === "number";
        let header: string;
        if (literal(from) && literal(to)) header = single(join(end, value(from), "?do"), list);
        else if (literal(from) || isSym(from)) {
          header = single(join(end, value(from), "max", value(from), "?do"), list);
        } else header = single(join(end, value(from), "tuck max swap ?do"), list);
        const footer = step === 1 ? "loop" : `${step} +loop`;
        return doLoop(header, counter, bodyClauses(args.slice(i), list), mode, footer);
      }
      if (isSym(args[0], "repeat")) {
        const guard = typeof args[1] === "number" ? "" : "0 max";
        return doLoop(
          single(join(value(args[1]), guard, "0 ?do"), list),
          undefined,
          bodyClauses(args.slice(2), list),
          mode,
        );
      }

      const clauses: ({ kind: "test"; form: SExpr } | { kind: "do"; forms: SExpr[] })[] = [];
      for (let i = 0; i < args.length; ) {
        const keyword = symbolName(args[i], "a loop keyword");
        if (keyword === "while" || keyword === "until") {
          const test = keyword === "while" ? args[i + 1] : [sym("not"), args[i + 1]];
          clauses.push({ kind: "test", form: test });
          i += 2;
        } else if (keyword === "do") {
          i++;
          let current: SExpr[] = [];
          while (i < args.length && !isSym(args[i])) {
            const form = args[i++];
            const test = breakTest(form);
            if (test === undefined) {
              current.push(form);
              continue;
            }
            if (current.length) clauses.push({ kind: "do", forms: current });
            clauses.push({ kind: "test", form: test });
            current = [];
          }
          if (current.length) clauses.push({ kind: "do", forms: current });
        } else {
          fail(`loop ${keyword} is not supported in Forth`, where(args[i]));
        }
      }

      const block: Block = { name: "nil", kind: "begin", doDepth: context.doDepth };
      const code = withBlock(block, () => {
        const pieces: Code[] = [];
        let tests = 0;
        let escaping = false;
        for (const clause of clauses) {
          if (clause.kind === "test") {
            let test = value(clause.form);
            if (escaping) test = join(`${flagOf(block).forth} if false else`, test, "then");
            pieces.push(join(test, "while"));
            tests++;
            continue;
          }
          let body = sequence(clause.forms, "effect");
          for (const target of body.escapes) {
            if (target !== block)
              fail("cannot jump out of a loop to an outer block", where(clause.forms));
          }
          if (escaping) body = structure(`${flagOf(block).forth} 0= if`, body, "then");
          if (body.escapes.has(block)) escaping = true;
          pieces.push(body);
        }
        if (block.flag) {
          pieces.unshift(words(`${block.flag.forth} 0= while`));
          tests++;
        }
        const footer =
          tests === 0 ? "again" : ["repeat", ...Array(tests - 1).fill("then")].join(" ");
        const first = inline(pieces[0] ?? empty());
        const startsWithTest = block.flag !== undefined || clauses[0]?.kind === "test";
        const loopCode =
          startsWithTest && first !== undefined
            ? stack(words(`begin ${first}`), indent(stack(...pieces.slice(1))), words(footer))
            : stack(words("begin"), indent(stack(...pieces)), words(footer));
        return block.flag ? stack(words(`false to ${block.flag.forth}`), loopCode) : loopCode;
      });
      return mode === "value" ? stack(code, words("false")) : code;
    };

    const returnFrom = (list: SExpr[], mode: Mode): Code => {
      const plain = head(list) === "return";
      const name = plain ? "nil" : symbolName(list[1], "a block name");
      const result = plain ? list[1] : list[2];
      const blockIndex = context.blocks.map((block) => block.name).lastIndexOf(name);
      if (blockIndex < 0) {
        if (!context.self || name !== context.self.name)
          fail(`no block named ${name}`, where(list));
        const unloops = Array(context.doDepth).fill("unloop").join(" ");
        let returned = empty();
        if (context.self.returnsValue)
          returned = result === undefined ? words("false") : value(result);
        else if (result !== undefined) returned = compile(result, "effect");
        return join(returned, unloops, context.self.recursive ? RESTORE : "", "exit");
      }
      const block = context.blocks[blockIndex];
      const inner = context.blocks.slice(blockIndex + 1);
      const prefix = result === undefined ? empty() : compile(result, "effect");
      if (block.kind === "do") {
        if (inner.some((item) => item.kind === "do"))
          fail("cannot leave an outer loop", where(list));
        return join(prefix, "leave");
      }
      if (inner.some((item) => item.kind !== "block"))
        fail("cannot jump out of nested loops", where(list));
      const code = join(prefix, `true to ${flagOf(block).forth}`);
      code.escapes.add(block);
      return mode === "value" ? join(code, "false") : code;
    };

    const caseForm = (list: SExpr[], mode: Mode): Code => {
      const [, key, ...clauses] = list;
      const parsed = clauses.map((clause) => {
        if (!Array.isArray(clause) || clause.length === 0)
          fail("expected a case clause", where(list));
        const [keys, ...body] = clause;
        const isDefault = isSym(keys, "t") || isSym(keys, "otherwise");
        const values = isDefault
          ? []
          : (Array.isArray(keys) ? keys : [keys]).map((item) => {
              if (typeof item === "number") return item;
              if (isChar(item)) return item.value.charCodeAt(0);
              fail("case keys must be numbers or characters", where(item));
            });
        return { isDefault, values, body };
      });
      if (mode === "effect") {
        const arms: Code[] = [];
        let fallback = empty();
        for (const clause of parsed) {
          if (clause.isDefault) {
            const body = sequence(clause.body, "effect");
            const jumpsOut = clause.body.some((item) =>
              containsForm(item, (inner) => ["return", "return-from"].includes(head(inner) ?? "")),
            );
            fallback = jumpsOut ? stack(words("drop"), body, words("0")) : body;
            continue;
          }
          for (const item of clause.values) {
            arms.push(structure(`${item} of`, sequence(clause.body, "effect"), "endof"));
          }
        }
        return stack(join(value(key), "case"), indent(stack(...arms, fallback)), words("endcase"));
      }
      const temp = allocate("key");
      const chain = (index: number): Code => {
        const clause = parsed[index];
        if (!clause) return words("false");
        if (clause.isDefault) return sequence(clause.body, "value");
        const test = clause.values
          .map((item, i) => `${temp.forth} ${item} =${i > 0 ? " or" : ""}`)
          .join(" ");
        return stack(
          words(`${test} if`),
          indent(sequence(clause.body, "value")),
          words("else"),
          indent(chain(index + 1)),
          words("then"),
        );
      };
      return stack(join(value(key), `to ${temp.forth}`), chain(0));
    };

    const condition = (form: SExpr): Code => {
      const type = typeOf(form);
      if (type === "unknown" || type === "bool") return value(form);
      if (typeof form === "number" || isStr(form) || isChar(form)) return words("true");
      return join(value(form), "drop true");
    };

    const condForm = (clauses: SExpr[], mode: Mode): Code => {
      const [clause, ...rest] = clauses;
      if (clause === undefined) return mode === "value" ? words("false") : empty();
      if (!Array.isArray(clause) || clause.length < 2)
        fail("cond clauses need a test and a body", where(clauses));
      const [test, ...body] = clause;
      if (isSym(test, "t") || isSym(test, "otherwise")) return sequence(body, mode);
      const then = sequence(body, mode);
      if (rest.length === 0 && mode === "effect")
        return structure(join(condition(test), "if"), then, "then");
      return stack(
        join(condition(test), "if"),
        indent(then),
        words("else"),
        indent(condForm(rest, mode)),
        words("then"),
      );
    };

    const hasEffects = (form: SExpr): boolean =>
      containsForm(form, (list) => {
        const name = head(list) ?? "";
        return functions.has(name) || STATEMENTS.has(name);
      });

    const logical = (operator: "and" | "or", args: SExpr[]): Code => {
      if (args.length === 0) return words(operator === "and" ? "true" : "false");
      if (args.length === 1) return condition(args[0]);
      const [first, ...rest] = args;
      if (rest.some(hasEffects)) {
        const remainder = logical(operator, rest);
        return operator === "and"
          ? join(condition(first), "if", remainder, "else false then")
          : join(condition(first), "if true else", remainder, "then");
      }
      return join(condition(first), ...rest.map((item) => join(condition(item), operator)));
    };

    const value = (form: SExpr): Code => compile(form, "value");

    const assign = (target: SExpr, newValue: Code, mode: Mode): Code => {
      if (["aref", "svref", "elt"].includes(head(target) ?? "") && Array.isArray(target)) {
        const address = cell(target[1], target[2]);
        return mode === "value"
          ? join(newValue, "dup", address, "!")
          : join(newValue, address, "!");
      }
      const variable = resolve(target);
      if (variable.kind === "index") fail("loop counters cannot be assigned here", where(target));
      if (variable.kind === "array") fail("arrays cannot be assigned", where(target));
      return join(newValue, mode === "value" ? `dup to ${variable.forth}` : `to ${variable.forth}`);
    };

    const change = (list: SExpr[], mode: Mode): Code => {
      const [operator, target, amount] = list;
      const minus = isSym(operator, "decf");
      const delta = amount === undefined ? undefined : value(amount);
      if (["aref", "svref", "elt"].includes(head(target) ?? "") && Array.isArray(target)) {
        const address = cell(target[1], target[2]);
        if (mode === "effect") return join(delta ?? "1", minus ? "negate" : "", address, "+!");
        return join(address, "dup @", delta ?? "1", minus ? "-" : "+", "dup rot !");
      }
      const variable = resolve(target);
      if (variable.kind !== "value") fail("only variables can be incremented", where(target));
      const step = delta === undefined ? (minus ? "1-" : "1+") : join(delta, minus ? "-" : "+");
      const store = mode === "value" ? `dup to ${variable.forth}` : `to ${variable.forth}`;
      return join(variable.forth, step, store);
    };

    const compile = (form: SExpr, mode: Mode): Code => {
      if (typeof form === "number") return mode === "value" ? words(String(form)) : empty();
      if (isSym(form)) {
        if (mode === "effect") return empty();
        if (form.name === "t") return words("true");
        if (form.name === "nil") return words("false");
        return words(reference(resolve(form), form));
      }
      if (isChar(form)) return mode === "value" ? words(String(form.value.charCodeAt(0))) : empty();
      if (isStr(form)) {
        if (mode === "effect") return empty();
        fail("strings can only be printed in Forth", where(form));
      }
      if (!Array.isArray(form)) return empty();
      if (form.length === 0) return mode === "value" ? words("false") : empty();
      const operator = head(form);
      if (operator === undefined) fail("expected a function name", where(form));
      const args = form.slice(1);
      const effectOnly = (code: Code): Code => (mode === "value" ? join(code, "false") : code);
      const pure = (code: Code): Code => (mode === "value" ? code : join(code, "drop"));
      const binary = (word: string): Code => {
        if (args.length !== 2) fail(`${operator} needs two arguments`, where(form));
        return pure(join(value(args[0]), value(args[1]), word));
      };

      switch (operator) {
        case "quote":
        case "function":
        case "lambda":
        case "funcall":
        case "apply":
        case "list":
        case "cons":
        case "car":
        case "cdr":
        case "make-array":
        case "vector":
          fail(
            operator === "make-array" || operator === "vector"
              ? "arrays can only be created in let or setq"
              : `${operator} is not supported in Forth`,
            where(form),
          );
          break;
        case "declare":
          return empty();
        case "the":
          return compile(args[1], mode);
        case "progn":
          return sequence(args, mode);
        case "prog1":
          if (mode === "effect") return sequence(args, mode);
          return stack(value(args[0]), sequence(args.slice(1), "effect"));
        case "setq":
        case "setf": {
          const pairs: Code[] = [];
          for (let i = 0; i < args.length; i += 2) {
            pairs.push(assign(args[i], value(args[i + 1]), i + 2 >= args.length ? mode : "effect"));
          }
          return stack(...pairs);
        }
        case "incf":
        case "decf":
          return change(form, mode);
        case "if": {
          const [test, then, otherwise] = args;
          if (mode === "value" && then === 1 && otherwise === 0 && typeOf(test) === "bool") {
            return join(value(test), "negate");
          }
          const thenCode = compile(then, mode);
          const elseCode =
            otherwise === undefined
              ? mode === "value"
                ? words("false")
                : empty()
              : compile(otherwise, mode);
          const header = join(condition(test), "if");
          if (elseCode.lines.length === 0) return structure(header, thenCode, "then");
          const parts = [inline(header), inline(thenCode), inline(elseCode)];
          if (parts.every((part) => part !== undefined)) {
            const short = `${parts[0]} ${parts[1]} else ${parts[2]} then`;
            if (short.length <= 60) {
              return {
                lines: [{ depth: 0, text: short }],
                escapes: new Set([...thenCode.escapes, ...elseCode.escapes]),
              };
            }
          }
          return stack(header, indent(thenCode), words("else"), indent(elseCode), words("then"));
        }
        case "when":
        case "unless": {
          const header = join(condition(args[0]), operator === "unless" ? "0= if" : "if");
          const body = sequence(args.slice(1), mode);
          if (mode === "effect") return structure(header, body, "then");
          return stack(header, indent(body), words("else false then"));
        }
        case "cond":
          return condForm(args, mode);
        case "case":
          return caseForm(form, mode);
        case "and":
        case "or":
          return pure(logical(operator, args));
        case "let":
        case "let*":
          return letForm(form, mode, operator === "let*");
        case "block": {
          const name = symbolName(args[0], "a block name");
          const block: Block = { name, kind: "block", doDepth: context.doDepth };
          return withBlock(block, () => {
            const body = sequence(args.slice(1), mode);
            return block.flag ? stack(words(`false to ${block.flag.forth}`), body) : body;
          });
        }
        case "return":
        case "return-from":
          return returnFrom(form, mode);
        case "loop":
          return loopForm(form, mode);
        case "dotimes": {
          const [spec, ...body] = args;
          if (!Array.isArray(spec) || spec.length < 2) {
            fail("expected (dotimes (var count) ...)", where(form));
          }
          const counter = symbolName(spec[0], "a loop variable");
          const guard = typeof spec[1] === "number" ? "" : "0 max";
          const header = single(join(value(spec[1]), guard, "0 ?do"), form);
          const code = doLoop(header, counter, body, "effect");
          if (spec[2] !== undefined) return stack(code, compile(spec[2], mode));
          return mode === "value" ? stack(code, words("false")) : code;
        }
        case "format":
          return effectOnly(printing(args));
        case "princ":
        case "prin1":
        case "write":
          return effectOnly(show(args[0], operator !== "princ"));
        case "print":
          return effectOnly(join("cr", show(args[0], true), "space"));
        case "terpri":
          return effectOnly(words("cr"));
        case "write-char":
          return effectOnly(join(value(args[0]), "emit"));
        case "write-string":
        case "write-line": {
          const [content] = args;
          if (!isStr(content)) fail(`${operator} needs a literal string`, where(form));
          const extra = operator === "write-line" ? ["cr"] : [];
          return effectOnly(words([...text(content.value), ...extra].join(" ")));
        }
        case "aref":
        case "svref":
        case "elt":
          return pure(join(cell(args[0], args[1]), "@"));
        case "fill": {
          const variable = resolve(args[0]);
          if (variable.size === undefined) fail("fill needs an array of known size", where(form));
          if (args[1] === 0 || isSym(args[1], "nil")) {
            return effectOnly(words(`${variable.forth} ${variable.size} cells erase`));
          }
          const store = join(value(args[1]), variable.forth, "i cells + !");
          return effectOnly(structure(`${variable.size} 0 ?do`, store, "loop"));
        }
        case "length": {
          const variable = resolve(args[0]);
          if (variable.size === undefined) fail("length needs an array of known size", where(form));
          return pure(words(String(variable.size)));
        }
        case "-":
          if (args.length === 1) return pure(join(value(args[0]), "negate"));
          return pure(join(value(args[0]), ...args.slice(1).map((item) => join(value(item), "-"))));
        case "truncate":
        case "rem":
          if (args.length === 1 && operator === "truncate") return compile(args[0], mode);
          helpers.add(operator === "truncate" ? "quot" : "rem");
          return binary(operator === "truncate" ? "quot" : "rem");
        case "floor":
          if (args.length === 1) return compile(args[0], mode);
          return binary("/");
        case "ceiling":
          if (args.length === 1) return compile(args[0], mode);
          return pure(join(value(args[0]), "negate", value(args[1]), "/ negate"));
        case "mod":
          return binary("mod");
        case "ash": {
          const [number, shift] = args;
          if (args.length !== 2) fail("ash needs two arguments", where(form));
          if (typeof shift === "number") {
            const word = shift >= 0 ? `${shift} lshift` : `1 ${-shift} lshift /`;
            return pure(join(value(number), word));
          }
          if (head(shift) === "-" && Array.isArray(shift) && shift.length === 2) {
            return pure(join(value(number), "1", value(shift[1]), "lshift /"));
          }
          helpers.add("ash");
          return binary("ash");
        }
        case "expt":
        case "gcd":
          helpers.add(operator);
          return binary(operator);
      }

      if (operator in VARIADIC) {
        if (args.length === 0) {
          const identity: Record<string, string> = {
            "+": "0",
            "*": "1",
            logand: "-1",
            logior: "0",
            logxor: "0",
          };
          if (!(operator in identity)) fail(`${operator} needs arguments`, where(form));
          return pure(words(identity[operator]));
        }
        const [first, ...rest] = args.map(value);
        return pure(join(first, ...rest.map((item) => join(item, VARIADIC[operator]))));
      }
      if (operator in COMPARISONS) {
        if (args.length < 2) return pure(words("true"));
        if (args.length > 2 && args.some((item) => Array.isArray(item))) {
          fail(`${operator} with more than two arguments needs simple values`, where(form));
        }
        const pairs = args
          .slice(1)
          .map((item, i) =>
            join(value(args[i]), value(item), COMPARISONS[operator], i > 0 ? "and" : ""),
          );
        return pure(join(...pairs));
      }
      if (operator in UNARY) {
        if (args.length !== 1) fail(`${operator} needs one argument`, where(form));
        const operand =
          operator === "not" || operator === "null" ? condition(args[0]) : value(args[0]);
        return pure(join(operand, UNARY[operator]));
      }
      if (functions.has(operator)) return call(form, mode);
      fail(`unknown function '${operator}'`, where(form));
    };

    return sequence(body, mode);
  };

  const newContext = (prefix: string, self?: Callable): Context => ({
    prefix,
    self,
    declarations: [],
    scalars: [],
    used: new Set(),
    scopes: [new Map()],
    blocks: [],
    doDepth: 0,
  });

  const render = (code: Code, depth: number): string[] =>
    code.lines.map((line) => `${"  ".repeat(line.depth + depth)}${line.text}`);

  const sections: string[][] = [];
  let topCount = 0;

  const defineGlobal = (name: string, init: SExpr, isConstant: boolean, at: Position): string[] => {
    if (globals.has(name) || functions.has(name)) fail(`'${name}' is already defined`, at);
    const forth = forthName(name);
    if (head(init) === "vector" && Array.isArray(init)) {
      const values = init.slice(1);
      if (values.some((item) => typeof item !== "number")) fail("global vectors need numbers", at);
      globals.set(name, { forth, kind: "array", size: values.length });
      return [`create ${forth} ${values.map((item) => `${item} ,`).join(" ")}`];
    }
    if (head(init) === "make-array" && Array.isArray(init)) {
      const size = init[1];
      if (typeof size !== "number") fail("make-array needs a number", at);
      const keywords = init.slice(2);
      const position = keywords.findIndex((item) => isSym(item, ":initial-element"));
      const initial = position >= 0 ? keywords[position + 1] : 0;
      globals.set(name, { forth, kind: "array", size });
      if (initial === 0 || initial === undefined || isSym(initial, "nil")) {
        return [`create ${forth} ${size} cells allot`, `${forth} ${size} cells erase`];
      }
      if (typeof initial !== "number") fail("the initial element must be a number", at);
      return [`create ${forth} ${Array(size).fill(`${initial} ,`).join(" ")}`];
    }
    const code = compileBody(newContext("top"), [init], "value");
    const text = inline(code);
    if (text === undefined || hasControl(code))
      fail("global values need a simple initial value", at);
    globals.set(name, { forth, kind: "value" });
    return [`${text} ${isConstant ? "constant" : "value"} ${forth}`];
  };

  const topLevel = (statements: SExpr[]): string[] => {
    topCount++;
    const context = newContext(topCount === 1 ? "top" : `top${topCount}`);
    const code = stack(
      ...statements.map((statement) => {
        const callee = functions.get(head(statement) ?? "");
        return compileBody(context, [statement], callee?.returnsValue ? "value" : "effect");
      }),
    );
    if (!hasControl(code)) return [...context.declarations, ...render(code, 0)];
    return [...context.declarations, ":noname", ...render(code, 1), "; execute"];
  };

  let pending: SExpr[] = [];
  const flush = () => {
    if (pending.length) sections.push(topLevel(pending));
    pending = [];
  };

  for (const form of forms) {
    const operator = head(form);
    if (!Array.isArray(form) || operator === undefined)
      fail("expected a top-level form", where(form));
    if (operator === "defun") {
      flush();
      const fn = functions.get(symbolName(form[1], "a function name")) as Callable;
      const context = newContext(fn.forth, fn);
      const { params, body } = bodyForms(form);
      const paramVariables = params.map((param) => {
        const name = symbolName(param, "a parameter");
        const local = `${fn.forth}.${name}`;
        const variable: Variable = {
          forth: GFORTH_WORDS.has(local) ? `${local}_` : local,
          kind: "value",
        };
        context.used.add(variable.forth);
        context.declarations.push(`0 value ${variable.forth}`);
        context.scalars.push(variable);
        context.scopes[0].set(name, variable);
        return variable;
      });
      const code = compileBody(context, body, fn.returnsValue ? "value" : "effect");
      const save = context.scalars.map((v) => `${v.forth} >r`).join(" ");
      const restore = context.scalars
        .map((v) => `r> to ${v.forth}`)
        .reverse()
        .join(" ");
      const recursive = fn.recursive && context.scalars.length > 0;
      const lines = [
        ...(recursive ? [save] : []),
        ...(paramVariables.length
          ? [
              paramVariables
                .map((v) => `to ${v.forth}`)
                .reverse()
                .join(" "),
            ]
          : []),
        ...render(code, 0),
        ...(recursive ? [restore] : []),
      ].map((line) => `  ${line.split(RESTORE).join(restore)}`);
      if (lines.length === 0) lines.push(" ");
      lines[lines.length - 1] = `${lines[lines.length - 1].trimEnd()} ;`;
      if (fn.deferred) lines[lines.length - 1] += ` is ${fn.forth}`;
      sections.push([...context.declarations, fn.deferred ? ":noname" : `: ${fn.forth}`, ...lines]);
      continue;
    }
    if (
      ["setq", "setf", "defvar", "defparameter", "defconstant"].includes(operator) &&
      isSym(form[1])
    ) {
      const name = symbolName(form[1], operator === "setf" ? "a variable" : "a variable name");
      const existing = globals.get(name);
      if (existing && (operator === "setq" || operator === "setf" || operator === "defparameter")) {
        pending.push([sym("setq"), form[1], form[2]]);
        continue;
      }
      if (existing) continue;
      flush();
      sections.push(defineGlobal(name, form[2] ?? 0, operator === "defconstant", where(form)));
      continue;
    }
    pending.push(form);
  }
  flush();

  const isSimple = (lines: string[]) =>
    lines.every((line) => / (value|constant) \S+$|^create |cells erase$/.test(line));
  const merged: string[][] = [];
  for (const section of sections) {
    const previous = merged[merged.length - 1];
    if (previous && isSimple(previous) && isSimple(section)) previous.push(...section);
    else merged.push([...section]);
  }

  const prelude = [
    [...helpers].sort().map((helper) => HELPERS[helper]),
    [...functions.values()].filter((fn) => fn.deferred).map((fn) => `defer ${fn.forth}`),
  ].filter((section) => section.length > 0);
  return `${[...prelude, ...merged].map((section) => section.join("\n")).join("\n\n")}\n`;
}
