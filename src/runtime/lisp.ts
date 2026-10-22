import { type SExpr, head, isChar, isStr, isSym, read } from "../compiler/sexpr";

class Cons {
  constructor(
    public car: Value,
    public cdr: Value,
  ) {}
}

class Character {
  constructor(readonly code: number) {}
}

class LispSymbol {
  constructor(readonly name: string) {}
}

type Builtin = (...args: Value[]) => Value;

class Closure {
  constructor(
    readonly name: string,
    readonly params: string[],
    readonly optional: { name: string; init: SExpr }[],
    readonly rest: string | undefined,
    readonly body: SExpr[],
    readonly scope: Scope,
  ) {}
}

type Value =
  | bigint
  | string
  | true
  | null
  | Cons
  | Value[]
  | Character
  | LispSymbol
  | Closure
  | Builtin;

export interface RunResult {
  output: string;
  error?: string;
}

export interface RunOptions {
  maxSteps?: number;
  maxDepth?: number;
}

class LispError extends Error {}

class Return {
  constructor(
    readonly block: string,
    readonly value: Value,
  ) {}
}

class Scope {
  readonly vars = new Map<string, Value>();
  constructor(readonly parent?: Scope) {}

  find(name: string): Scope | undefined {
    return this.vars.has(name) ? this : this.parent?.find(name);
  }
}

const CHAR_NAMES: Record<string, string> = { " ": "Space", "\n": "Newline", "\t": "Tab" };

const ACCUMULATORS: Record<string, string> = {
  collect: "collect",
  collecting: "collect",
  append: "append",
  appending: "append",
  nconc: "append",
  sum: "sum",
  summing: "sum",
  count: "count",
  counting: "count",
  maximize: "maximize",
  maximizing: "maximize",
  minimize: "minimize",
  minimizing: "minimize",
};

const truthy = (value: Value): boolean => value !== null;
const bool = (condition: boolean): Value => (condition ? true : null);

function list(...items: Value[]): Value {
  let result: Value = null;
  for (let i = items.length - 1; i >= 0; i--) result = new Cons(items[i], result);
  return result;
}

function text(value: Value, readably: boolean): string {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") {
    return readably ? `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"` : value;
  }
  if (value === null) return "NIL";
  if (value === true) return "T";
  if (value instanceof Character) {
    const char = String.fromCharCode(value.code);
    return readably ? `#\\${CHAR_NAMES[char] ?? char}` : char;
  }
  if (value instanceof LispSymbol) return value.name.toUpperCase();
  if (value instanceof Closure) return `#<FUNCTION ${value.name.toUpperCase()}>`;
  if (typeof value === "function") return "#<SYSTEM-FUNCTION>";
  if (Array.isArray(value)) return `#(${value.map((item) => text(item, readably)).join(" ")})`;
  const parts: string[] = [];
  let current: Value = value;
  while (current instanceof Cons) {
    parts.push(text(current.car, readably));
    current = current.cdr;
  }
  return `(${parts.join(" ")}${current === null ? "" : ` . ${text(current, readably)}`})`;
}

function toArray(value: Value, operator: string): Value[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [...value].map((char) => new Character(char.charCodeAt(0)));
  const items: Value[] = [];
  let current: Value = value;
  while (current instanceof Cons) {
    items.push(current.car);
    current = current.cdr;
  }
  if (current !== null) {
    throw new LispError(`${operator.toUpperCase()}: ${text(value, true)} is not a proper list`);
  }
  return items;
}

function integer(value: Value, operator: string): bigint {
  if (typeof value !== "bigint") {
    throw new LispError(`${operator.toUpperCase()}: ${text(value, true)} is not an integer`);
  }
  return value;
}

function divide(operator: string, a: bigint, b: bigint): bigint {
  if (b === 0n) throw new LispError(`${operator.toUpperCase()}: division by zero`);
  const quotient = a / b;
  const remainder = a % b;
  const negative = a < 0n !== b < 0n;
  switch (operator) {
    case "truncate":
      return quotient;
    case "rem":
      return remainder;
    case "floor":
      return remainder !== 0n && negative ? quotient - 1n : quotient;
    case "ceiling":
      return remainder !== 0n && !negative ? quotient + 1n : quotient;
    case "round": {
      const twice = 2n * (remainder < 0n ? -remainder : remainder);
      const size = b < 0n ? -b : b;
      const away = negative ? quotient - 1n : quotient + 1n;
      if (twice > size) return away;
      if (twice < size) return quotient;
      return quotient % 2n === 0n ? quotient : away;
    }
    default:
      return remainder !== 0n && remainder < 0n !== b < 0n ? remainder + b : remainder;
  }
}

function eql(a: Value, b: Value): boolean {
  if (a instanceof Character && b instanceof Character) return a.code === b.code;
  if (a instanceof LispSymbol && b instanceof LispSymbol) return a.name === b.name;
  return a === b;
}

function equal(a: Value, b: Value): boolean {
  if (a instanceof Cons && b instanceof Cons) return equal(a.car, b.car) && equal(a.cdr, b.cdr);
  if (typeof a === "string" && typeof b === "string") return a === b;
  return eql(a, b);
}

function quoted(form: SExpr): Value {
  if (typeof form === "number") return BigInt(form);
  if (isStr(form)) return form.value;
  if (isChar(form)) return new Character(form.value.charCodeAt(0));
  if (isSym(form)) {
    if (form.name === "nil") return null;
    if (form.name === "t") return true;
    return new LispSymbol(form.name);
  }
  if (Array.isArray(form)) {
    const dot = form.findIndex((item) => isSym(item, "."));
    if (dot >= 0) {
      let result = quoted(form[dot + 1]);
      for (let i = dot - 1; i >= 0; i--) result = new Cons(quoted(form[i]), result);
      return result;
    }
    return list(...form.map(quoted));
  }
  return null;
}

const COMPARE: Record<string, (a: bigint, b: bigint) => boolean> = {
  "=": (a, b) => a === b,
  "<": (a, b) => a < b,
  ">": (a, b) => a > b,
  "<=": (a, b) => a <= b,
  ">=": (a, b) => a >= b,
};

export function runLisp(source: string, options: RunOptions = {}): RunResult {
  const maxSteps = options.maxSteps ?? 5_000_000;
  const maxDepth = options.maxDepth ?? 2_000;
  const globals = new Scope();
  const specials = new Set<string>();
  const functions = new Map<string, Closure | Builtin>();
  let output = "";
  let steps = 0;
  let depth = 0;

  const write = (content: string) => {
    output += content;
  };

  const asCons = (value: Value, operator: string): Cons => {
    if (!(value instanceof Cons)) {
      throw new LispError(`${operator.toUpperCase()}: ${text(value, true)} is not a list`);
    }
    return value;
  };

  const index = (array: Value, position: Value, operator: string): number => {
    if (!Array.isArray(array)) {
      throw new LispError(`${operator.toUpperCase()}: ${text(array, true)} is not an array`);
    }
    const at = integer(position, operator);
    if (at < 0n || at >= BigInt(array.length)) {
      throw new LispError(`${operator.toUpperCase()}: index ${at} is out of bounds`);
    }
    return Number(at);
  };

  const assign = (name: string, value: Value, scope: Scope): Value => {
    if (name === "t" || name === "nil")
      throw new LispError(`SETQ: ${name.toUpperCase()} is a constant`);
    (scope.find(name) ?? globals).vars.set(name, value);
    return value;
  };

  const binder = (scope: Scope) => {
    const restored: [string, Value | undefined][] = [];
    return {
      bind: (name: string, value: Value) => {
        if (specials.has(name)) {
          restored.push([name, globals.vars.get(name)]);
          globals.vars.set(name, value);
        } else {
          scope.vars.set(name, value);
        }
      },
      restore: () => {
        for (const [name, value] of restored.reverse()) {
          if (value === undefined) globals.vars.delete(name);
          else globals.vars.set(name, value);
        }
      },
    };
  };

  const callable = (value: Value, operator: string): Closure | Builtin => {
    if (value instanceof Closure) return value;
    if (typeof value === "function") return value as Builtin;
    if (value instanceof LispSymbol) {
      const found = functions.get(value.name);
      if (found) return found;
    }
    throw new LispError(`${operator}: ${text(value, true)} is not a function`);
  };

  const apply = (fn: Closure | Builtin, args: Value[]): Value => {
    if (typeof fn === "function") return fn(...args);
    const { params, optional, rest } = fn;
    if (args.length < params.length || (!rest && args.length > params.length + optional.length)) {
      throw new LispError(`${fn.name.toUpperCase()}: wrong number of arguments: ${args.length}`);
    }
    if (++depth > maxDepth) throw new LispError("Program stack overflow");
    const scope = new Scope(fn.scope);
    const { bind, restore } = binder(scope);
    try {
      params.forEach((param, i) => bind(param, args[i]));
      optional.forEach((param, i) => {
        const supplied = args[params.length + i];
        bind(param.name, supplied === undefined ? evaluate(param.init, scope) : supplied);
      });
      if (rest) bind(rest, list(...args.slice(params.length + optional.length)));
      return sequence(fn.body, scope);
    } catch (signal) {
      if (signal instanceof Return && signal.block === fn.name) return signal.value;
      throw signal;
    } finally {
      depth--;
      restore();
    }
  };

  const lambda = (name: string, params: SExpr, body: SExpr[], scope: Scope): Closure => {
    if (!Array.isArray(params)) throw new LispError(`${name.toUpperCase()}: invalid lambda list`);
    const required: string[] = [];
    const optional: { name: string; init: SExpr }[] = [];
    let rest: string | undefined;
    let section = "required";
    for (const param of params) {
      if (isSym(param) && param.name.startsWith("&")) {
        section = param.name;
        continue;
      }
      const [symbol, init] = Array.isArray(param) ? param : [param, undefined];
      if (!isSym(symbol)) throw new LispError(`${name.toUpperCase()}: invalid parameter`);
      if (section === "&optional") optional.push({ name: symbol.name, init: init ?? sym0 });
      else if (section === "&rest" || section === "&body") rest = symbol.name;
      else required.push(symbol.name);
    }
    const forms = body.filter(
      (item, i) => head(item) !== "declare" && !(i === 0 && isStr(item) && body.length > 1),
    );
    return new Closure(name, required, optional, rest, forms, scope);
  };

  const radix = (value: Value, base: number): string =>
    typeof value === "bigint" ? value.toString(base).toUpperCase() : text(value, false);

  const format = (pattern: Value, values: Value[]): string => {
    if (typeof pattern !== "string")
      throw new LispError("FORMAT: the control string must be a string");
    let result = "";
    let lower: number | undefined;
    const next = (): Value => {
      if (values.length === 0) throw new LispError("FORMAT: not enough arguments");
      return values.shift() as Value;
    };
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== "~") {
        result += pattern[i];
        continue;
      }
      let prefix = "";
      while (/[\d,']/.test(pattern[i + 1] ?? "")) {
        prefix += pattern[++i];
        if (prefix.endsWith("'")) prefix += pattern[++i];
      }
      let atSign = false;
      while (pattern[i + 1] === "@" || pattern[i + 1] === ":") {
        if (pattern[++i] === "@") atSign = true;
      }
      const directive = (pattern[++i] ?? "").toLowerCase();
      const [widthText, padText] = prefix.split(",");
      const width = widthText ? Number(widthText) : 0;
      const pad = padText?.startsWith("'") ? padText[1] : " ";
      const left = (content: string) => content.padStart(width, pad);
      const right = (content: string) =>
        atSign ? content.padStart(width, pad) : content.padEnd(width, pad);
      switch (directive) {
        case "%":
          result += "\n".repeat(Math.max(width, 1));
          break;
        case "&": {
          const written = output + result;
          if (written.length > 0 && !written.endsWith("\n")) result += "\n";
          break;
        }
        case "~":
          result += "~";
          break;
        case "a":
          result += right(text(next(), false));
          break;
        case "s":
          result += right(text(next(), true));
          break;
        case "d":
          result += left(radix(next(), 10));
          break;
        case "b":
          result += left(radix(next(), 2));
          break;
        case "o":
          result += left(radix(next(), 8));
          break;
        case "x":
          result += left(radix(next(), 16));
          break;
        case "c": {
          const value = next();
          if (!(value instanceof Character)) throw new LispError("FORMAT: ~C needs a character");
          result += String.fromCharCode(value.code);
          break;
        }
        case "(":
          lower = result.length;
          break;
        case ")":
          if (lower !== undefined)
            result = result.slice(0, lower) + result.slice(lower).toLowerCase();
          lower = undefined;
          break;
        default:
          throw new LispError(`FORMAT: unsupported directive ~${directive}`);
      }
    }
    return result;
  };

  const builtins: Record<string, Builtin> = {
    "+": (...args) => args.reduce<bigint>((sum, value) => sum + integer(value, "+"), 0n),
    "*": (...args) => args.reduce<bigint>((product, value) => product * integer(value, "*"), 1n),
    "-": (...args) => {
      const numbers = args.map((value) => integer(value, "-"));
      if (numbers.length === 0) throw new LispError("-: needs at least one argument");
      if (numbers.length === 1) return -numbers[0];
      return numbers.slice(1).reduce((difference, value) => difference - value, numbers[0]);
    },
    "/": (...args) => {
      const numbers = args.map((value) => integer(value, "/"));
      if (numbers.length === 1) numbers.unshift(1n);
      return numbers.slice(1).reduce((quotient, value) => {
        if (value === 0n) throw new LispError("/: division by zero");
        if (quotient % value !== 0n) throw new LispError("/: ratios are not supported");
        return quotient / value;
      }, numbers[0]);
    },
    "1+": (value) => integer(value, "1+") + 1n,
    "1-": (value) => integer(value, "1-") - 1n,
    abs: (value) => {
      const number = integer(value, "abs");
      return number < 0n ? -number : number;
    },
    max: (...args) => args.map((value) => integer(value, "max")).reduce((a, b) => (b > a ? b : a)),
    min: (...args) => args.map((value) => integer(value, "min")).reduce((a, b) => (b < a ? b : a)),
    gcd: (...args) =>
      args
        .map((value) => integer(value, "gcd"))
        .reduce((a, b) => {
          let x = a < 0n ? -a : a;
          let y = b < 0n ? -b : b;
          while (y) [x, y] = [y, x % y];
          return x;
        }, 0n),
    expt: (base, power) => {
      const exponent = integer(power, "expt");
      if (exponent < 0n) throw new LispError("EXPT: ratios are not supported");
      return integer(base, "expt") ** exponent;
    },
    isqrt: (value) => {
      const number = integer(value, "isqrt");
      if (number < 0n) throw new LispError("ISQRT: negative number");
      let root = 0n;
      while ((root + 1n) * (root + 1n) <= number) root++;
      return root;
    },
    ash: (value, shift) => {
      const number = integer(value, "ash");
      const count = integer(shift, "ash");
      return count >= 0n ? number << count : number >> -count;
    },
    logand: (...args) => args.reduce<bigint>((all, value) => all & integer(value, "logand"), -1n),
    logior: (...args) => args.reduce<bigint>((all, value) => all | integer(value, "logior"), 0n),
    logxor: (...args) => args.reduce<bigint>((all, value) => all ^ integer(value, "logxor"), 0n),
    lognot: (value) => ~integer(value, "lognot"),
    evenp: (value) => bool(integer(value, "evenp") % 2n === 0n),
    oddp: (value) => bool(integer(value, "oddp") % 2n !== 0n),
    zerop: (value) => bool(integer(value, "zerop") === 0n),
    plusp: (value) => bool(integer(value, "plusp") > 0n),
    minusp: (value) => bool(integer(value, "minusp") < 0n),
    numberp: (value) => bool(typeof value === "bigint"),
    integerp: (value) => bool(typeof value === "bigint"),
    "/=": (...args) => {
      const numbers = args.map((value) => integer(value, "/="));
      return bool(numbers.every((a, i) => numbers.every((b, j) => i === j || a !== b)));
    },
    not: (value) => bool(!truthy(value)),
    null: (value) => bool(value === null),
    eq: (a, b) => bool(eql(a, b)),
    eql: (a, b) => bool(eql(a, b)),
    equal: (a, b) => bool(equal(a, b)),
    atom: (value) => bool(!(value instanceof Cons)),
    consp: (value) => bool(value instanceof Cons),
    listp: (value) => bool(value === null || value instanceof Cons),
    symbolp: (value) => bool(value === null || value === true || value instanceof LispSymbol),
    stringp: (value) => bool(typeof value === "string"),
    characterp: (value) => bool(value instanceof Character),
    functionp: (value) => bool(value instanceof Closure || typeof value === "function"),
    cons: (a, b) => new Cons(a, b),
    car: (value) => (value === null ? null : asCons(value, "car").car),
    cdr: (value) => (value === null ? null : asCons(value, "cdr").cdr),
    list: (...args) => list(...args),
    "list*": (...args) => {
      let result: Value = args[args.length - 1] ?? null;
      for (let i = args.length - 2; i >= 0; i--) result = new Cons(args[i], result);
      return result;
    },
    append: (...args) => {
      if (args.length === 0) return null;
      let result = args[args.length - 1];
      for (let i = args.length - 2; i >= 0; i--) {
        const items = toArray(args[i], "append");
        for (let j = items.length - 1; j >= 0; j--) result = new Cons(items[j], result);
      }
      return result;
    },
    reverse: (value) => {
      if (Array.isArray(value)) return [...value].reverse();
      if (typeof value === "string") return [...value].reverse().join("");
      return list(...toArray(value, "reverse").reverse());
    },
    length: (value) => BigInt(toArray(value, "length").length),
    nth: (position, value) => toArray(value, "nth")[Number(integer(position, "nth"))] ?? null,
    nthcdr: (position, value) => {
      let current = value;
      for (let i = 0n; i < integer(position, "nthcdr") && current instanceof Cons; i++) {
        current = current.cdr;
      }
      return current;
    },
    last: (value) => {
      let current = value;
      while (current instanceof Cons && current.cdr instanceof Cons) current = current.cdr;
      return current;
    },
    member: (item, value) => {
      let current = value;
      while (current instanceof Cons) {
        if (eql(current.car, item)) return current;
        current = current.cdr;
      }
      return null;
    },
    assoc: (key, value) =>
      toArray(value, "assoc").find((entry) => entry instanceof Cons && eql(entry.car, key)) ?? null,
    remove: (item, value) => {
      const kept = toArray(value, "remove").filter((entry) => !eql(entry, item));
      return Array.isArray(value) ? kept : list(...kept);
    },
    "copy-list": (value) => list(...toArray(value, "copy-list")),
    vector: (...args) => args,
    aref: (array, position) => (array as Value[])[index(array, position, "aref")],
    svref: (array, position) => (array as Value[])[index(array, position, "svref")],
    "code-char": (value) => new Character(Number(integer(value, "code-char"))),
    "char-code": (value) => {
      if (!(value instanceof Character)) throw new LispError("CHAR-CODE: not a character");
      return BigInt(value.code);
    },
    "string-upcase": (value) => text(value, false).toUpperCase(),
    "string-downcase": (value) => text(value, false).toLowerCase(),
    identity: (value) => value,
    values: (value) => value ?? null,
    "make-list": (size) =>
      list(...Array.from({ length: Number(integer(size, "make-list")) }, () => null)),
    funcall: (fn, ...args) => apply(callable(fn, "FUNCALL"), args),
    apply: (fn, ...args) => {
      const spread = args.length ? toArray(args[args.length - 1], "apply") : [];
      return apply(callable(fn, "APPLY"), [...args.slice(0, -1), ...spread]);
    },
    mapcar: (fn, ...lists) => {
      const target = callable(fn, "MAPCAR");
      const arrays = lists.map((value) => toArray(value, "mapcar"));
      const size = Math.min(...arrays.map((items) => items.length));
      return list(
        ...Array.from({ length: size }, (_, i) =>
          apply(
            target,
            arrays.map((items) => items[i]),
          ),
        ),
      );
    },
    reduce: (fn, value) => {
      const target = callable(fn, "REDUCE");
      const items = toArray(value, "reduce");
      if (items.length === 0) return apply(target, []);
      return items.slice(1).reduce((acc, item) => apply(target, [acc, item]), items[0]);
    },
    terpri: () => {
      write("\n");
      return null;
    },
    "fresh-line": () => {
      if (output.length > 0 && !output.endsWith("\n")) write("\n");
      return null;
    },
    princ: (value) => {
      write(text(value, false));
      return value;
    },
    prin1: (value) => {
      write(text(value, true));
      return value;
    },
    write: (value) => {
      write(text(value, true));
      return value;
    },
    print: (value) => {
      write(`\n${text(value, true)} `);
      return value;
    },
    "write-char": (value) => {
      if (!(value instanceof Character)) throw new LispError("WRITE-CHAR: not a character");
      write(String.fromCharCode(value.code));
      return value;
    },
    "write-string": (value) => {
      write(text(value, false));
      return value;
    },
    "write-line": (value) => {
      write(`${text(value, false)}\n`);
      return value;
    },
    format: (destination, pattern, ...args) => {
      const result = format(pattern, args);
      if (destination === null) return result;
      write(result);
      return null;
    },
  };
  builtins.first = builtins.car;
  builtins.rest = builtins.cdr;
  builtins.second = (value) => builtins.nth(1n, value);
  builtins.third = (value) => builtins.nth(2n, value);
  builtins.elt = (array, position) =>
    Array.isArray(array) ? builtins.aref(array, position) : builtins.nth(position, array);
  for (const [name, compare] of Object.entries(COMPARE)) {
    builtins[name] = (...args) => {
      const numbers = args.map((value) => integer(value, name));
      return bool(numbers.every((value, i) => i === 0 || compare(numbers[i - 1], value)));
    };
  }
  for (const name of ["truncate", "floor", "ceiling", "round", "mod", "rem"]) {
    builtins[name] = (a, b = 1n) => divide(name, integer(a, name), integer(b, name));
  }
  for (const [name, fn] of Object.entries(builtins)) functions.set(name, fn);

  const sequence = (forms: SExpr[], scope: Scope): Value => {
    let result: Value = null;
    for (const form of forms) result = evaluate(form, scope);
    return result;
  };

  const setPlace = (place: SExpr, value: Value, scope: Scope): Value => {
    if (isSym(place)) return assign(place.name, value, scope);
    const name = head(place);
    if (!Array.isArray(place) || name === undefined) throw new LispError("SETF: invalid place");
    const target = evaluate(place[1], scope);
    switch (name) {
      case "aref":
      case "svref":
      case "elt": {
        const array = target as Value[];
        array[index(target, evaluate(place[2], scope), name)] = value;
        return value;
      }
      case "car":
      case "first":
        asCons(target, name).car = value;
        return value;
      case "cdr":
      case "rest":
        asCons(target, name).cdr = value;
        return value;
      case "nth": {
        let current = evaluate(place[2], scope);
        for (let i = 0n; i < integer(target, "nth"); i++) current = asCons(current, "nth").cdr;
        asCons(current, "nth").car = value;
        return value;
      }
      default:
        throw new LispError(`SETF: ${name.toUpperCase()} is not a supported place`);
    }
  };

  const block = (name: string, run: () => Value): Value => {
    try {
      return run();
    } catch (signal) {
      if (signal instanceof Return && signal.block === name) return signal.value;
      throw signal;
    }
  };

  const loop = (args: SExpr[], scope: Scope): Value => {
    if (args.length > 0 && !isSym(args[0])) {
      return block("nil", () => {
        for (;;) sequence(args, scope);
      });
    }
    const inner = new Scope(scope);
    const drivers: { start: () => void; step: () => boolean }[] = [];
    const body: { kind: string; forms: SExpr[] }[] = [];
    const finale: SExpr[] = [];
    const collected: Value[] = [];
    let accumulator: Value = null;
    let accumulating: string | undefined;
    let i = 0;
    const keyword = () => {
      const item = args[i];
      return isSym(item) ? item.name : "";
    };
    const take = (): SExpr => args[i++];

    while (i < args.length) {
      const word = keyword();
      i++;
      if (word === "for" || word === "as") {
        const variable = keyword();
        i++;
        const kind = keyword();
        if (kind === "in" || kind === "across" || kind === "on") {
          i++;
          const source = take();
          let items: Value[] = [];
          let current: Value = null;
          let position = 0;
          drivers.push({
            start: () => {
              const value = evaluate(source, inner);
              if (kind === "on") current = value;
              else items = toArray(value, "loop");
              position = 0;
            },
            step: () => {
              if (kind === "on") {
                if (!(current instanceof Cons)) return false;
                inner.vars.set(variable, current);
                current = current.cdr;
                return true;
              }
              if (position >= items.length) return false;
              inner.vars.set(variable, items[position++]);
              return true;
            },
          });
        } else if (kind === "=") {
          i++;
          const init = take();
          let then: SExpr | undefined;
          if (keyword() === "then") {
            i++;
            then = take();
          }
          let first = true;
          drivers.push({
            start: () => {
              first = true;
            },
            step: () => {
              inner.vars.set(variable, evaluate(first || then === undefined ? init : then, inner));
              first = false;
              return true;
            },
          });
        } else {
          let from: SExpr = 0;
          let to: SExpr | undefined;
          let by: SExpr = 1;
          let direction = 1n;
          let inclusive = true;
          const parts = [
            "from",
            "upfrom",
            "downfrom",
            "to",
            "upto",
            "below",
            "downto",
            "above",
            "by",
          ];
          while (parts.includes(keyword())) {
            const part = keyword();
            i++;
            const valueForm = take();
            if (part === "from" || part === "upfrom") from = valueForm;
            else if (part === "downfrom") {
              from = valueForm;
              direction = -1n;
            } else if (part === "by") by = valueForm;
            else {
              to = valueForm;
              inclusive = part === "to" || part === "upto" || part === "downto";
              if (part === "downto" || part === "above") direction = -1n;
            }
          }
          let current = 0n;
          let limit: bigint | undefined;
          let stride = 1n;
          let first = true;
          drivers.push({
            start: () => {
              current = integer(evaluate(from, inner), "loop");
              limit = to === undefined ? undefined : integer(evaluate(to, inner), "loop");
              stride = integer(evaluate(by, inner), "loop") * direction;
              first = true;
            },
            step: () => {
              if (!first) current += stride;
              first = false;
              if (limit !== undefined) {
                const past =
                  direction > 0n
                    ? inclusive
                      ? current > limit
                      : current >= limit
                    : inclusive
                      ? current < limit
                      : current <= limit;
                if (past) return false;
              }
              inner.vars.set(variable, current);
              return true;
            },
          });
        }
      } else if (word === "repeat") {
        const count = take();
        let remaining = 0n;
        drivers.push({
          start: () => {
            remaining = integer(evaluate(count, inner), "loop");
          },
          step: () => remaining-- > 0n,
        });
      } else if (word === "while" || word === "until" || word === "return") {
        body.push({ kind: word, forms: [take()] });
      } else if (word === "do" || word === "doing") {
        const forms: SExpr[] = [];
        while (i < args.length && !isSym(args[i])) forms.push(take());
        body.push({ kind: "do", forms });
      } else if (word in ACCUMULATORS) {
        accumulating = ACCUMULATORS[word];
        body.push({ kind: accumulating, forms: [take()] });
        if (keyword() === "into") throw new LispError("LOOP: INTO is not supported");
      } else if (word === "when" || word === "if" || word === "unless") {
        const test = take();
        const action = ACCUMULATORS[keyword()] ?? keyword();
        i++;
        body.push({ kind: `${word}:${action}`, forms: [test, take()] });
        if (Object.values(ACCUMULATORS).includes(action)) accumulating = action;
      } else if (word === "finally") {
        while (i < args.length && !isSym(args[i])) finale.push(take());
      } else {
        throw new LispError(`LOOP: ${word.toUpperCase() || "this clause"} is not supported`);
      }
    }
    if (accumulating === "sum" || accumulating === "count") accumulator = 0n;
    const accumulate = (kind: string, value: Value) => {
      if (kind === "collect") collected.push(value);
      else if (kind === "append") collected.push(...toArray(value, "loop"));
      else if (kind === "sum") accumulator = integer(accumulator, "loop") + integer(value, "loop");
      else if (kind === "count")
        accumulator = integer(accumulator, "loop") + (truthy(value) ? 1n : 0n);
      else {
        const number = integer(value, "loop");
        const better =
          accumulator === null ||
          (kind === "maximize"
            ? number > integer(accumulator, "loop")
            : number < integer(accumulator, "loop"));
        if (better) accumulator = number;
      }
    };
    return block("nil", () => {
      for (const driver of drivers) driver.start();
      for (;;) {
        if (!drivers.every((driver) => driver.step())) break;
        let stop = false;
        for (const clause of body) {
          if (clause.kind === "while") stop = !truthy(evaluate(clause.forms[0], inner));
          else if (clause.kind === "until") stop = truthy(evaluate(clause.forms[0], inner));
          else if (clause.kind === "do") sequence(clause.forms, inner);
          else if (clause.kind === "return")
            throw new Return("nil", evaluate(clause.forms[0], inner));
          else if (clause.kind.includes(":")) {
            const [condition, action] = clause.kind.split(":");
            const test = truthy(evaluate(clause.forms[0], inner));
            if (condition === "unless" ? test : !test) continue;
            if (action === "do") evaluate(clause.forms[1], inner);
            else if (action === "return") throw new Return("nil", evaluate(clause.forms[1], inner));
            else accumulate(action, evaluate(clause.forms[1], inner));
          } else accumulate(clause.kind, evaluate(clause.forms[0], inner));
          if (stop) break;
        }
        if (stop) break;
      }
      sequence(finale, inner);
      if (accumulating === "collect" || accumulating === "append") return list(...collected);
      return accumulator;
    });
  };

  const sym0: SExpr = { kind: "symbol", name: "nil" };

  const evaluate = (form: SExpr, scope: Scope): Value => {
    if (++steps > maxSteps)
      throw new LispError(`stopped after ${maxSteps.toLocaleString("en")} steps`);
    if (typeof form === "number") return BigInt(form);
    if (isStr(form)) return form.value;
    if (isChar(form)) return new Character(form.value.charCodeAt(0));
    if (isSym(form)) {
      if (form.name === "t") return true;
      if (form.name === "nil") return null;
      if (form.name.startsWith(":")) return new LispSymbol(form.name);
      const owner = scope.find(form.name);
      if (!owner) throw new LispError(`EVAL: variable ${form.name.toUpperCase()} has no value`);
      return owner.vars.get(form.name) as Value;
    }
    if (!Array.isArray(form) || form.length === 0) return null;
    const operator = head(form);
    const args = form.slice(1);
    if (operator === undefined) {
      const [first] = form;
      if (head(first) === "lambda" && Array.isArray(first)) {
        const fn = lambda("lambda", first[1], first.slice(2), scope);
        return apply(
          fn,
          args.map((arg) => evaluate(arg, scope)),
        );
      }
      throw new LispError(`EVAL: ${text(quoted(first), true)} is not a function name`);
    }

    switch (operator) {
      case "quote":
        return quoted(args[0]);
      case "function": {
        const [target] = args;
        if (head(target) === "lambda" && Array.isArray(target)) {
          return lambda("lambda", target[1], target.slice(2), scope);
        }
        const name = isSym(target) ? target.name : "";
        const fn = functions.get(name);
        if (!fn) throw new LispError(`FUNCTION: undefined function ${name.toUpperCase()}`);
        return fn;
      }
      case "lambda":
        return lambda("lambda", args[0], args.slice(1), scope);
      case "setq":
      case "setf": {
        let result: Value = null;
        for (let i = 0; i < args.length; i += 2) {
          result = setPlace(args[i], evaluate(args[i + 1], scope), scope);
        }
        return result;
      }
      case "incf":
      case "decf": {
        const delta = args[1] === undefined ? 1n : integer(evaluate(args[1], scope), operator);
        const current = integer(evaluate(args[0], scope), operator);
        return setPlace(args[0], operator === "incf" ? current + delta : current - delta, scope);
      }
      case "push":
        return setPlace(
          args[1],
          new Cons(evaluate(args[0], scope), evaluate(args[1], scope)),
          scope,
        );
      case "pop": {
        const current = evaluate(args[0], scope);
        if (current === null) return null;
        const cell = asCons(current, "pop");
        setPlace(args[0], cell.cdr, scope);
        return cell.car;
      }
      case "defun": {
        const [name, params, ...body] = args;
        if (!isSym(name)) throw new LispError("DEFUN: invalid function name");
        if (name.name in builtins) {
          throw new LispError(`DEFUN: ${name.name.toUpperCase()} is a built-in function`);
        }
        functions.set(name.name, lambda(name.name, params, body, globals));
        return new LispSymbol(name.name);
      }
      case "defvar":
      case "defparameter":
      case "defconstant": {
        const name = isSym(args[0]) ? args[0].name : "";
        if (operator !== "defconstant") specials.add(name);
        if (operator !== "defvar" || !globals.vars.has(name)) {
          globals.vars.set(name, args[1] === undefined ? null : evaluate(args[1], scope));
        }
        return new LispSymbol(name);
      }
      case "let":
      case "let*": {
        const [bindings, ...body] = args;
        if (!Array.isArray(bindings)) throw new LispError("LET: invalid bindings");
        const inner = new Scope(scope);
        const { bind, restore } = binder(inner);
        try {
          const values = bindings.map((binding) => {
            const [name, init] = Array.isArray(binding) ? binding : [binding, undefined];
            if (!isSym(name)) throw new LispError("LET: invalid binding");
            const value =
              init === undefined ? null : evaluate(init, operator === "let" ? scope : inner);
            if (operator === "let*") bind(name.name, value);
            return [name.name, value] as const;
          });
          if (operator === "let") for (const [name, value] of values) bind(name, value);
          return sequence(body, inner);
        } finally {
          restore();
        }
      }
      case "progn":
        return sequence(args, scope);
      case "prog1": {
        const first = evaluate(args[0], scope);
        sequence(args.slice(1), scope);
        return first;
      }
      case "prog2": {
        evaluate(args[0], scope);
        const second = evaluate(args[1], scope);
        sequence(args.slice(2), scope);
        return second;
      }
      case "if":
        if (truthy(evaluate(args[0], scope))) return evaluate(args[1], scope);
        return args[2] === undefined ? null : evaluate(args[2], scope);
      case "when":
        return truthy(evaluate(args[0], scope)) ? sequence(args.slice(1), scope) : null;
      case "unless":
        return truthy(evaluate(args[0], scope)) ? null : sequence(args.slice(1), scope);
      case "cond":
        for (const clause of args) {
          if (!Array.isArray(clause)) throw new LispError("COND: invalid clause");
          const test = evaluate(clause[0], scope);
          if (truthy(test)) return clause.length > 1 ? sequence(clause.slice(1), scope) : test;
        }
        return null;
      case "case":
      case "ecase": {
        const key = evaluate(args[0], scope);
        for (const clause of args.slice(1)) {
          if (!Array.isArray(clause)) throw new LispError("CASE: invalid clause");
          const [keys, ...body] = clause;
          const isDefault = isSym(keys, "t") || isSym(keys, "otherwise");
          const candidates = Array.isArray(keys) ? keys : [keys];
          if (isDefault || candidates.some((candidate) => eql(quoted(candidate), key))) {
            return sequence(body, scope);
          }
        }
        if (operator === "ecase") throw new LispError(`ECASE: ${text(key, true)} fell through`);
        return null;
      }
      case "and": {
        let result: Value = true;
        for (const arg of args) {
          result = evaluate(arg, scope);
          if (!truthy(result)) return null;
        }
        return result;
      }
      case "or":
        for (const arg of args) {
          const result = evaluate(arg, scope);
          if (truthy(result)) return result;
        }
        return null;
      case "block": {
        const name = isSym(args[0]) ? args[0].name : "nil";
        return block(name, () => sequence(args.slice(1), scope));
      }
      case "return-from":
        if (!isSym(args[0])) throw new LispError("RETURN-FROM: invalid block name");
        throw new Return(args[0].name, args[1] === undefined ? null : evaluate(args[1], scope));
      case "return":
        throw new Return("nil", args[0] === undefined ? null : evaluate(args[0], scope));
      case "loop":
        return loop(args, scope);
      case "dotimes":
      case "dolist": {
        const [spec, ...body] = args;
        if (!Array.isArray(spec) || !isSym(spec[0])) {
          throw new LispError(`${operator.toUpperCase()}: invalid spec`);
        }
        const inner = new Scope(scope);
        const name = spec[0].name;
        return block("nil", () => {
          if (operator === "dotimes") {
            const count = integer(evaluate(spec[1], scope), "dotimes");
            for (let i = 0n; i < count; i++) {
              inner.vars.set(name, i);
              sequence(body, inner);
            }
            inner.vars.set(name, count < 0n ? 0n : count);
          } else {
            for (const item of toArray(evaluate(spec[1], scope), "dolist")) {
              inner.vars.set(name, item);
              sequence(body, inner);
            }
            inner.vars.set(name, null);
          }
          return spec[2] === undefined ? null : evaluate(spec[2], inner);
        });
      }
      case "declare":
        return null;
      case "the":
        return evaluate(args[1], scope);
      case "make-array": {
        const size = Number(integer(evaluate(args[0], scope), "make-array"));
        let initial: Value = null;
        for (let i = 1; i < args.length; i += 2) {
          if (isSym(args[i], ":initial-element")) initial = evaluate(args[i + 1], scope);
          else if (isSym(args[i], ":initial-contents")) {
            return toArray(evaluate(args[i + 1], scope), "make-array").slice(0, size);
          }
        }
        return Array.from({ length: size }, () => initial);
      }
      case "fill": {
        const array = evaluate(args[0], scope);
        const value = evaluate(args[1], scope);
        if (!Array.isArray(array)) throw new LispError("FILL: not an array");
        array.fill(value);
        return array;
      }
    }

    const fn = functions.get(operator);
    if (!fn) throw new LispError(`EVAL: undefined function ${operator.toUpperCase()}`);
    return apply(
      fn,
      args.map((arg) => evaluate(arg, scope)),
    );
  };

  try {
    for (const form of read(source)) evaluate(form, globals);
    return { output };
  } catch (error) {
    if (error instanceof Return) {
      return { output, error: `RETURN-FROM: no block named ${error.block.toUpperCase()}` };
    }
    if (error instanceof RangeError) return { output, error: "Program stack overflow" };
    return { output, error: error instanceof Error ? error.message : String(error) };
  }
}
