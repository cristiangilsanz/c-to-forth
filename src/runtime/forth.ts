import type { RunOptions, RunResult } from "./lisp";

type Op =
  | { kind: "literal"; value: bigint }
  | { kind: "call"; word: Word }
  | { kind: "branch"; target: number }
  | { kind: "branch-if-zero"; target: number }
  | { kind: "exit" }
  | { kind: "print"; text: string }
  | { kind: "string"; address: bigint; length: bigint }
  | { kind: "store-value"; word: ValueWord }
  | { kind: "set-defer"; word: DeferWord }
  | { kind: "do"; check: boolean; target: number }
  | { kind: "loop"; step: boolean; target: number }
  | { kind: "leave"; target: number }
  | { kind: "of"; target: number };

interface ValueWord {
  kind: "value";
  name: string;
  value: bigint;
}

interface DeferWord {
  kind: "defer";
  name: string;
  target?: Word;
}

type Word =
  | { kind: "primitive"; name: string; run: () => void }
  | { kind: "colon"; name: string; code: Op[] }
  | ValueWord
  | DeferWord
  | { kind: "constant"; name: string; value: bigint }
  | { kind: "address"; name: string; address: bigint };

interface Control {
  kind: "orig" | "dest" | "do" | "case" | "of";
  at: number;
  leaves?: number[];
  ends?: number[];
}

class ForthError extends Error {}

const wrap = (value: bigint): bigint => BigInt.asIntN(64, value);
const flag = (condition: boolean): bigint => (condition ? -1n : 0n);
const unsigned = (value: bigint): bigint => BigInt.asUintN(64, value);

function floored(a: bigint, b: bigint): [bigint, bigint] {
  if (b === 0n) throw new ForthError("Division by zero");
  let quotient = a / b;
  let remainder = a % b;
  if (remainder !== 0n && remainder < 0n !== b < 0n) {
    quotient -= 1n;
    remainder += b;
  }
  return [quotient, remainder];
}

export function runForth(source: string, options: RunOptions = {}): RunResult {
  const maxSteps = options.maxSteps ?? 5_000_000;
  const maxDepth = options.maxDepth ?? 2_000;
  const stack: bigint[] = [];
  const returnStack: bigint[] = [];
  const memory: bigint[] = [];
  const dictionary = new Map<string, Word>();
  const tokens: Word[] = [];
  let output = "";
  let steps = 0;
  let position = 0;
  let base = 10n;
  const baseAddress = 0n;
  memory.push(10n);

  const pop = (): bigint => {
    const value = stack.pop();
    if (value === undefined) throw new ForthError("Stack underflow");
    return value;
  };
  const push = (...values: bigint[]) => {
    for (const value of values) stack.push(wrap(value));
  };
  const cell = (address: bigint): number => {
    if (address < 0n || address >= BigInt(memory.length)) {
      throw new ForthError(`Invalid memory address ${address}`);
    }
    return Number(address);
  };
  const fromReturnStack = (offset: number, remove: boolean): bigint => {
    const index = returnStack.length - 1 - offset;
    if (index < 0) throw new ForthError("Return stack underflow");
    const value = returnStack[index];
    if (remove) returnStack.splice(index, 1);
    return value;
  };
  const write = (text: string) => {
    output += text;
  };
  const number = (value: bigint): string => {
    base = memory[0];
    if (base < 2n || base > 36n) throw new ForthError("Invalid base");
    return value.toString(Number(base)).toUpperCase();
  };
  const allot = (count: bigint) => {
    for (let i = 0n; i < count; i++) memory.push(0n);
  };
  const store = (text: string): [bigint, bigint] => {
    const address = BigInt(memory.length);
    for (const char of text) memory.push(BigInt(char.charCodeAt(0)));
    return [address, BigInt(text.length)];
  };
  const token = (word: Word): bigint => {
    const existing = tokens.indexOf(word);
    if (existing >= 0) return BigInt(existing);
    tokens.push(word);
    return BigInt(tokens.length - 1);
  };
  const fromToken = (value: bigint): Word => {
    const word = tokens[Number(value)];
    if (value < 0n || !word) throw new ForthError("Invalid execution token");
    return word;
  };

  const binary = (operation: (a: bigint, b: bigint) => bigint | bigint[]) => (): void => {
    const b = pop();
    const result = operation(pop(), b);
    push(...(Array.isArray(result) ? result : [result]));
  };
  const unary = (operation: (a: bigint) => bigint | bigint[]) => (): void => {
    const result = operation(pop());
    push(...(Array.isArray(result) ? result : [result]));
  };
  const double = (operation: (low: bigint, divisor: bigint) => bigint[]) => (): void => {
    const divisor = pop();
    pop();
    push(...operation(pop(), divisor));
  };

  const primitives: Record<string, () => void> = {
    "+": binary((a, b) => a + b),
    "-": binary((a, b) => a - b),
    "*": binary((a, b) => a * b),
    "/": binary((a, b) => floored(a, b)[0]),
    mod: binary((a, b) => floored(a, b)[1]),
    "/mod": binary((a, b) => floored(a, b).reverse()),
    "*/": () => {
      const c = pop();
      const b = pop();
      push(floored(pop() * b, c)[0]);
    },
    "*/mod": () => {
      const c = pop();
      const b = pop();
      push(...floored(pop() * b, c).reverse());
    },
    "s>d": unary((a) => [a, a < 0n ? -1n : 0n]),
    "sm/rem": double((low, divisor) => {
      if (divisor === 0n) throw new ForthError("Division by zero");
      return [low % divisor, low / divisor];
    }),
    "fm/mod": double((low, divisor) => floored(low, divisor).reverse()),
    negate: unary((a) => -a),
    abs: unary((a) => (a < 0n ? -a : a)),
    min: binary((a, b) => (a < b ? a : b)),
    max: binary((a, b) => (a > b ? a : b)),
    "1+": unary((a) => a + 1n),
    "1-": unary((a) => a - 1n),
    "2*": unary((a) => a * 2n),
    "2/": unary((a) => a >> 1n),
    lshift: binary((a, b) => unsigned(a) << b),
    rshift: binary((a, b) => unsigned(a) >> b),
    "=": binary((a, b) => flag(a === b)),
    "<>": binary((a, b) => flag(a !== b)),
    "<": binary((a, b) => flag(a < b)),
    ">": binary((a, b) => flag(a > b)),
    "<=": binary((a, b) => flag(a <= b)),
    ">=": binary((a, b) => flag(a >= b)),
    "u<": binary((a, b) => flag(unsigned(a) < unsigned(b))),
    "u>": binary((a, b) => flag(unsigned(a) > unsigned(b))),
    "0=": unary((a) => flag(a === 0n)),
    "0<>": unary((a) => flag(a !== 0n)),
    "0<": unary((a) => flag(a < 0n)),
    "0>": unary((a) => flag(a > 0n)),
    within: () => {
      const high = pop();
      const low = pop();
      const value = pop();
      push(flag(unsigned(value - low) < unsigned(high - low)));
    },
    and: binary((a, b) => a & b),
    or: binary((a, b) => a | b),
    xor: binary((a, b) => a ^ b),
    invert: unary((a) => ~a),
    true: () => push(-1n),
    false: () => push(0n),
    bl: () => push(32n),
    dup: unary((a) => [a, a]),
    "?dup": unary((a) => (a === 0n ? [a] : [a, a])),
    drop: () => void pop(),
    swap: binary((a, b) => [b, a]),
    over: binary((a, b) => [a, b, a]),
    nip: binary((_, b) => b),
    tuck: binary((a, b) => [b, a, b]),
    rot: () => {
      const c = pop();
      const b = pop();
      push(b, c, pop());
    },
    "-rot": () => {
      const c = pop();
      const b = pop();
      const a = pop();
      push(c, a, b);
    },
    pick: () => {
      const index = Number(pop());
      const value = stack[stack.length - 1 - index];
      if (value === undefined || index < 0) throw new ForthError("Stack underflow");
      push(value);
    },
    roll: () => {
      const index = Number(pop());
      if (index < 0 || index >= stack.length) throw new ForthError("Stack underflow");
      push(stack.splice(stack.length - 1 - index, 1)[0]);
    },
    "2dup": binary((a, b) => [a, b, a, b]),
    "2drop": () => {
      pop();
      pop();
    },
    "2swap": () => {
      const d = pop();
      const c = pop();
      const b = pop();
      const a = pop();
      push(c, d, a, b);
    },
    "2over": () => {
      const d = pop();
      const c = pop();
      const b = pop();
      const a = pop();
      push(a, b, c, d, a, b);
    },
    depth: () => push(BigInt(stack.length)),
    ">r": () => returnStack.push(pop()),
    "r>": () => push(fromReturnStack(0, true)),
    "r@": () => push(fromReturnStack(0, false)),
    rdrop: () => void fromReturnStack(0, true),
    i: () => push(fromReturnStack(0, false)),
    j: () => push(fromReturnStack(2, false)),
    k: () => push(fromReturnStack(4, false)),
    unloop: () => {
      fromReturnStack(0, true);
      fromReturnStack(0, true);
    },
    "@": () => push(memory[cell(pop())]),
    "!": () => {
      const address = cell(pop());
      memory[address] = pop();
    },
    "c@": () => push(memory[cell(pop())]),
    "c!": () => {
      const address = cell(pop());
      memory[address] = pop() & 255n;
    },
    "+!": () => {
      const address = cell(pop());
      memory[address] = wrap(memory[address] + pop());
    },
    cells: () => {},
    chars: () => {},
    "cell+": unary((a) => a + 1n),
    "char+": unary((a) => a + 1n),
    here: () => push(BigInt(memory.length)),
    allot: () => allot(pop()),
    ",": () => memory.push(pop()),
    "c,": () => memory.push(pop() & 255n),
    erase: () => {
      const count = pop();
      const address = pop();
      for (let i = 0n; i < count; i++) memory[cell(address + i)] = 0n;
    },
    fill: () => {
      const char = pop();
      const count = pop();
      const address = pop();
      for (let i = 0n; i < count; i++) memory[cell(address + i)] = char;
    },
    base: () => push(baseAddress),
    hex: () => {
      memory[0] = 16n;
    },
    decimal: () => {
      memory[0] = 10n;
    },
    ".": () => write(`${number(pop())} `),
    "u.": () => write(`${number(unsigned(pop()))} `),
    ".r": () => {
      const width = Number(pop());
      write(number(pop()).padStart(width));
    },
    "u.r": () => {
      const width = Number(pop());
      write(number(unsigned(pop())).padStart(width));
    },
    ".s": () => write(`<${stack.length}> ${stack.map((value) => `${number(value)} `).join("")}`),
    emit: () => write(String.fromCharCode(Number(pop()))),
    cr: () => write("\n"),
    space: () => write(" "),
    spaces: () => write(" ".repeat(Math.max(0, Number(pop())))),
    type: () => {
      const length = pop();
      const address = pop();
      for (let i = 0n; i < length; i++)
        write(String.fromCharCode(Number(memory[cell(address + i)])));
    },
    execute: () => execute(fromToken(pop())),
    bye: () => {
      position = source.length;
    },
  };
  for (const [name, run] of Object.entries(primitives)) {
    dictionary.set(name, { kind: "primitive", name, run });
  }

  const nextToken = (): string | undefined => {
    while (position < source.length && /\s/.test(source[position])) position++;
    if (position >= source.length) return undefined;
    const start = position;
    while (position < source.length && !/\s/.test(source[position])) position++;
    return source.slice(start, position);
  };
  const parseUntil = (delimiter: string): string => {
    position++;
    let end = source.indexOf(delimiter, position);
    if (end < 0 && delimiter === "\n") end = source.length;
    if (end < 0) throw new ForthError(`Missing ${delimiter}`);
    const text = source.slice(position, end);
    position = end + 1;
    return text;
  };
  const newName = (): string => {
    const name = nextToken();
    if (name === undefined) throw new ForthError("Attempt to use zero-length string as a name");
    return name.toLowerCase();
  };
  const find = (name: string): Word => {
    const word = dictionary.get(name.toLowerCase());
    if (!word) throw new ForthError(`Undefined word ${name}`);
    return word;
  };
  const findValue = (): ValueWord | DeferWord => {
    const name = newName();
    const word = find(name);
    if (word.kind !== "value" && word.kind !== "defer")
      throw new ForthError(`${name} is not a value`);
    return word;
  };
  const parseNumber = (text: string): bigint | undefined => {
    if (/^'.'$/.test(text)) return BigInt(text.charCodeAt(1));
    let digits = text;
    let radix = Number(memory[0]);
    const prefixes: Record<string, number> = { $: 16, "#": 10, "%": 2 };
    if (digits[0] in prefixes) {
      radix = prefixes[digits[0]];
      digits = digits.slice(1);
    }
    const negative = digits.startsWith("-");
    if (negative) digits = digits.slice(1);
    if (!digits) return undefined;
    let result = 0n;
    for (const char of digits.toLowerCase()) {
      const digit = Number.parseInt(char, 36);
      if (Number.isNaN(digit) || digit >= radix) return undefined;
      result = result * BigInt(radix) + BigInt(digit);
    }
    return negative ? -result : result;
  };

  const execute = (word: Word): void => {
    if (word.kind === "defer") {
      if (!word.target) throw new ForthError(`${word.name} is not set`);
      execute(word.target);
      return;
    }
    if (word.kind === "primitive") {
      word.run();
      return;
    }
    if (word.kind !== "colon") {
      push(word.kind === "address" ? word.address : word.value);
      return;
    }
    const frames = [{ code: word.code, ip: 0 }];
    while (frames.length > 0) {
      const frame = frames[frames.length - 1];
      if (frame.ip >= frame.code.length) {
        frames.pop();
        continue;
      }
      if (++steps > maxSteps)
        throw new ForthError(`stopped after ${maxSteps.toLocaleString("en")} steps`);
      const op = frame.code[frame.ip++];
      switch (op.kind) {
        case "literal":
          push(op.value);
          break;
        case "string":
          push(op.address, op.length);
          break;
        case "call": {
          let target = op.word;
          while (target.kind === "defer") {
            if (!target.target) throw new ForthError(`${target.name} is not set`);
            target = target.target;
          }
          if (target.kind === "colon") {
            if (frames.length >= maxDepth) throw new ForthError("Return stack overflow");
            frames.push({ code: target.code, ip: 0 });
          } else {
            execute(target);
          }
          break;
        }
        case "branch":
          frame.ip = op.target;
          break;
        case "branch-if-zero":
          if (pop() === 0n) frame.ip = op.target;
          break;
        case "exit":
          frames.pop();
          break;
        case "print":
          write(op.text);
          break;
        case "store-value":
          op.word.value = pop();
          break;
        case "set-defer":
          op.word.target = fromToken(pop());
          break;
        case "do": {
          const index = pop();
          const limit = pop();
          if (op.check && index === limit) {
            frame.ip = op.target;
            break;
          }
          returnStack.push(limit, index);
          break;
        }
        case "loop": {
          const index = fromReturnStack(0, true);
          const limit = fromReturnStack(0, true);
          const increment = op.step ? pop() : 1n;
          const next = wrap(index + increment);
          const crossed = op.step
            ? (wrap(index - limit) ^ wrap(next - limit)) < 0n
            : next === limit;
          if (!crossed) {
            returnStack.push(limit, next);
            frame.ip = op.target;
          }
          break;
        }
        case "leave":
          fromReturnStack(0, true);
          fromReturnStack(0, true);
          frame.ip = op.target;
          break;
        case "of": {
          const test = pop();
          const selector = pop();
          if (test === selector) break;
          push(selector);
          frame.ip = op.target;
          break;
        }
      }
    }
  };

  const compile = (name: string | undefined): Word => {
    const word: Word = { kind: "colon", name: name ?? ":noname", code: [] };
    const code = word.code;
    const control: Control[] = [];
    const take = (...kinds: Control["kind"][]): Control => {
      const entry = control.pop();
      if (!entry || !kinds.includes(entry.kind)) throw new ForthError("Unstructured control flow");
      return entry;
    };
    const patch = (at: number) => {
      const op = code[at];
      if ("target" in op) op.target = code.length;
    };
    const innerDo = (): Control => {
      for (let i = control.length - 1; i >= 0; i--) if (control[i].kind === "do") return control[i];
      throw new ForthError("leave outside of a loop");
    };
    for (;;) {
      const text = nextToken();
      if (text === undefined) throw new ForthError(`Missing ; in definition of ${word.name}`);
      const lower = text.toLowerCase();
      switch (lower) {
        case ";":
          if (control.length > 0) throw new ForthError("Unstructured control flow");
          if (name !== undefined) dictionary.set(name, word);
          return word;
        case "if":
          control.push({ kind: "orig", at: code.length });
          code.push({ kind: "branch-if-zero", target: -1 });
          break;
        case "ahead":
          control.push({ kind: "orig", at: code.length });
          code.push({ kind: "branch", target: -1 });
          break;
        case "else": {
          const entry = take("orig");
          control.push({ kind: "orig", at: code.length });
          code.push({ kind: "branch", target: -1 });
          patch(entry.at);
          break;
        }
        case "then":
          patch(take("orig").at);
          break;
        case "begin":
          control.push({ kind: "dest", at: code.length });
          break;
        case "while": {
          const dest = take("dest");
          control.push({ kind: "orig", at: code.length }, dest);
          code.push({ kind: "branch-if-zero", target: -1 });
          break;
        }
        case "repeat": {
          code.push({ kind: "branch", target: take("dest").at });
          patch(take("orig").at);
          break;
        }
        case "until":
          code.push({ kind: "branch-if-zero", target: take("dest").at });
          break;
        case "again":
          code.push({ kind: "branch", target: take("dest").at });
          break;
        case "do":
        case "?do":
          control.push({ kind: "do", at: code.length + 1, leaves: [code.length] });
          code.push({ kind: "do", check: lower === "?do", target: -1 });
          break;
        case "loop":
        case "+loop": {
          const entry = take("do");
          code.push({ kind: "loop", step: lower === "+loop", target: entry.at });
          for (const at of entry.leaves ?? []) patch(at);
          break;
        }
        case "leave":
          innerDo().leaves?.push(code.length);
          code.push({ kind: "leave", target: -1 });
          break;
        case "unloop":
        case "i":
        case "j":
        case "k":
          code.push({ kind: "call", word: find(lower) });
          break;
        case "case":
          control.push({ kind: "case", at: code.length, ends: [] });
          break;
        case "of":
          control.push({ kind: "of", at: code.length });
          code.push({ kind: "of", target: -1 });
          break;
        case "endof": {
          const of = take("of");
          const entry = control[control.length - 1];
          if (entry?.kind !== "case") throw new ForthError("Unstructured control flow");
          entry.ends?.push(code.length);
          code.push({ kind: "branch", target: -1 });
          patch(of.at);
          break;
        }
        case "endcase": {
          const entry = take("case");
          code.push({ kind: "call", word: find("drop") });
          for (const at of entry.ends ?? []) patch(at);
          break;
        }
        case "exit":
          code.push({ kind: "exit" });
          break;
        case "recurse":
          code.push({ kind: "call", word });
          break;
        case "to":
        case "is": {
          const target = findValue();
          if (target.kind === "value") code.push({ kind: "store-value", word: target });
          else code.push({ kind: "set-defer", word: target });
          break;
        }
        case "[']":
          code.push({ kind: "literal", value: token(find(newName())) });
          break;
        case "[char]":
          code.push({ kind: "literal", value: BigInt((nextToken() ?? " ").charCodeAt(0)) });
          break;
        case '."':
          code.push({ kind: "print", text: parseUntil('"') });
          break;
        case 's"': {
          const [address, length] = store(parseUntil('"'));
          code.push({ kind: "string", address, length });
          break;
        }
        case ".(":
          write(parseUntil(")"));
          break;
        case "(":
          parseUntil(")");
          break;
        case "\\":
          parseUntil("\n");
          break;
        default: {
          const word = dictionary.get(lower);
          if (word) {
            code.push({ kind: "call", word });
            break;
          }
          const literal = parseNumber(text);
          if (literal === undefined) throw new ForthError(`Undefined word ${text}`);
          code.push({ kind: "literal", value: literal });
        }
      }
    }
  };

  const define = (word: Word) => dictionary.set(word.name, word);

  try {
    for (;;) {
      const text = nextToken();
      if (text === undefined) break;
      const lower = text.toLowerCase();
      switch (lower) {
        case ":":
          compile(newName());
          break;
        case ":noname":
          push(token(compile(undefined)));
          break;
        case "value":
          define({ kind: "value", name: newName(), value: pop() });
          break;
        case "constant":
          define({ kind: "constant", name: newName(), value: pop() });
          break;
        case "defer":
          define({ kind: "defer", name: newName() });
          break;
        case "to": {
          const target = findValue();
          if (target.kind === "value") target.value = pop();
          else target.target = fromToken(pop());
          break;
        }
        case "is": {
          const target = findValue();
          if (target.kind !== "defer") throw new ForthError(`${target.name} is not deferred`);
          target.target = fromToken(pop());
          break;
        }
        case "'":
          push(token(find(newName())));
          break;
        case "char":
          push(BigInt((nextToken() ?? " ").charCodeAt(0)));
          break;
        case "create":
          define({ kind: "address", name: newName(), address: BigInt(memory.length) });
          break;
        case "variable":
          define({ kind: "address", name: newName(), address: BigInt(memory.length) });
          memory.push(0n);
          break;
        case '."':
          write(parseUntil('"'));
          break;
        case 's"':
          push(...store(parseUntil('"')));
          break;
        case ".(":
          write(parseUntil(")"));
          break;
        case "(":
          parseUntil(")");
          break;
        case "\\":
          parseUntil("\n");
          break;
        default: {
          const word = dictionary.get(lower);
          if (word) {
            execute(word);
            break;
          }
          const literal = parseNumber(text);
          if (literal === undefined) throw new ForthError(`Undefined word ${text}`);
          push(literal);
        }
      }
    }
    return { output };
  } catch (error) {
    return { output, error: error instanceof Error ? error.message : String(error) };
  }
}
