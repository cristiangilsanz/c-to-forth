import type {
  AssignOperator,
  Case,
  Declarator,
  Expr,
  FunctionDef,
  Param,
  PrintPart,
  Program,
  Stmt,
  Target,
} from "./ast";
import { type Position, fail } from "./errors";
import { constant, parse } from "./parser";
import { COMMON_LISP, LISP_CONSTANTS } from "./reserved";
import { type SExpr, head, isSym, print, str, sym } from "./sexpr";

const COMPARISONS: Record<string, string> = {
  "<": "<",
  ">": ">",
  "<=": "<=",
  ">=": ">=",
  "==": "=",
  "!=": "/=",
};

const ARITHMETIC: Record<string, string> = {
  "+": "+",
  "-": "-",
  "*": "*",
  "&": "logand",
  "|": "logior",
  "^": "logxor",
};

const VECTOR_LIMIT = 32;

interface Variable {
  lisp: string;
  array: boolean;
  size?: number;
}

interface Callable {
  lisp: string;
  params: Param[];
  returnsValue: boolean;
  defined: boolean;
}

interface Typed {
  form: SExpr;
  bool: boolean;
}

function lispName(name: string, local: boolean): string {
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const taken = LISP_CONSTANTS.has(kebab) || (!local && COMMON_LISP.has(kebab));
  return taken ? `${kebab}_` : kebab;
}

function children(stmt: Stmt): Stmt[] {
  switch (stmt.kind) {
    case "block":
      return stmt.body;
    case "if":
      return [stmt.then, ...(stmt.otherwise ? [stmt.otherwise] : [])];
    case "while":
    case "do":
      return [stmt.body];
    case "for":
      return [...stmt.init, stmt.body];
    case "switch":
      return stmt.cases.flatMap((item) => item.body);
    default:
      return [];
  }
}

function returnsValue(stmts: Stmt[]): boolean {
  return stmts.some((stmt) =>
    stmt.kind === "return" ? stmt.value !== undefined : returnsValue(children(stmt)),
  );
}

function jumps(stmts: Stmt[], kind: "break" | "continue"): boolean {
  return stmts.some((stmt) => {
    if (stmt.kind === kind) return true;
    if (stmt.kind === "while" || stmt.kind === "do" || stmt.kind === "for") return false;
    if (stmt.kind === "switch" && kind === "break") return false;
    return jumps(children(stmt), kind);
  });
}

function exprs(stmt: Stmt): Expr[] {
  switch (stmt.kind) {
    case "declare":
      return stmt.declarators.flatMap((item) => [
        ...(item.init ? [item.init] : []),
        ...(item.values ?? []),
      ]);
    case "expression":
      return [stmt.expr];
    case "print":
      return stmt.parts.flatMap((part) => ("value" in part ? [part.value] : []));
    case "if":
    case "while":
    case "do":
      return [stmt.condition];
    case "for":
      return [...(stmt.condition ? [stmt.condition] : []), ...stmt.step];
    case "switch":
      return [stmt.value];
    case "return":
      return stmt.value ? [stmt.value] : [];
    default:
      return [];
  }
}

function subexprs(expr: Expr): Expr[] {
  switch (expr.kind) {
    case "index":
      return [expr.index];
    case "call":
      return expr.args;
    case "unary":
      return [expr.operand];
    case "binary":
      return [expr.left, expr.right];
    case "ternary":
      return [expr.condition, expr.then, expr.otherwise];
    case "assign":
      return [expr.target, expr.value];
    case "increment":
      return [expr.target];
    default:
      return [];
  }
}

function anyExpr(stmts: Stmt[], test: (expr: Expr) => boolean): boolean {
  const visit = (expr: Expr): boolean => test(expr) || subexprs(expr).some(visit);
  return stmts.some((stmt) => exprs(stmt).some(visit) || anyExpr(children(stmt), test));
}

function writes(stmts: Stmt[], name: string): boolean {
  return anyExpr(
    stmts,
    (expr) =>
      (expr.kind === "assign" || expr.kind === "increment") &&
      expr.target.kind === "variable" &&
      expr.target.name === name,
  );
}

export function toLisp(program: Program): string {
  const globals = new Map<string, Variable>();
  const functions = new Map<string, Callable>();
  const taken = new Map<string, string>();
  const output: { form: SExpr | string; group: string }[] = [];

  const claim = (names: Map<string, string>, name: string, at: Position): string => {
    const lisp = lispName(name, names !== taken);
    const owner = names.get(lisp);
    if (owner !== undefined && owner !== name) {
      fail(`'${name}' and '${owner}' would both become '${lisp}' in Lisp`, at);
    }
    names.set(lisp, name);
    return lisp;
  };

  for (const item of program.items) {
    if (item.kind !== "function") continue;
    if (["puts", "printf", "putchar"].includes(item.name)) {
      fail(`'${item.name}' is a built-in function`, item.at);
    }
    const valued = item.body ? returnsValue(item.body) : item.returns === "int";
    if (valued && item.returns === "void") {
      fail(`void function '${item.name}' cannot return a value`, item.at);
    }
    const existing = functions.get(item.name);
    if (existing) {
      if (existing.defined && item.body) fail(`'${item.name}' is already defined`, item.at);
      if (existing.params.length !== item.params.length) {
        fail(`'${item.name}' was declared with ${existing.params.length} parameter(s)`, item.at);
      }
      if (item.body) {
        existing.params = item.params;
        existing.returnsValue = valued;
        existing.defined = true;
      }
      continue;
    }
    functions.set(item.name, {
      lisp: claim(taken, item.name, item.at),
      params: item.params,
      returnsValue: valued,
      defined: Boolean(item.body),
    });
  }

  const arrayForm = (size: number, values: SExpr[]): SExpr => {
    if (values.length > 0 && size <= VECTOR_LIMIT) {
      return [sym("vector"), ...values, ...Array.from({ length: size - values.length }, () => 0)];
    }
    return [sym("make-array"), size, sym(":initial-element"), 0];
  };

  const declareGlobal = (declarator: Declarator): void => {
    const { name, at } = declarator;
    if (globals.has(name) || functions.has(name)) fail(`'${name}' is already declared`, at);
    const lisp = claim(taken, name, at);
    const folded = (expr: Expr): number => {
      const value = constant(expr);
      if (value === undefined) fail("global variables need a constant value", expr.at);
      return value;
    };
    if (declarator.size !== undefined) {
      globals.set(name, { lisp, array: true, size: declarator.size });
      const values = (declarator.values ?? []).map(folded);
      const form = arrayForm(declarator.size, values);
      output.push({ form: [sym("setq"), sym(lisp), form], group: "setq" });
      if (head(form) === "make-array") {
        values.forEach((value, i) => {
          if (value === 0) return;
          output.push({ form: [sym("setf"), [sym("aref"), sym(lisp), i], value], group: "setq" });
        });
      }
      return;
    }
    globals.set(name, { lisp, array: false });
    const value = declarator.init ? folded(declarator.init) : 0;
    output.push({ form: [sym("setq"), sym(lisp), value], group: "setq" });
  };

  const compileFunction = (fn: FunctionDef, statements: Stmt[]): void => {
    if (globals.has(fn.name)) fail(`'${fn.name}' is already declared`, fn.at);
    const self = functions.get(fn.name) as Callable;

    const localNames = new Map<string, string>();
    const declared = new Map<string, Variable[]>();
    const scopes: Map<string, Variable>[] = [new Map()];
    const bindings: SExpr[] = [];
    const targets: ("loop" | "switch")[] = [];

    const declareLocal = (name: string, at: Position, array: boolean, size?: number) => {
      const scope = scopes[scopes.length - 1];
      if (scope.has(name)) fail(`'${name}' is already declared in this scope`, at);
      const previous = declared.get(name) ?? [];
      const visible = (variable: Variable) => scopes.some((outer) => outer.get(name) === variable);
      const reusable = previous.find(
        (variable) => variable.array === array && variable.size === size && !visible(variable),
      );
      let variable = reusable;
      if (!variable) {
        let lisp = claim(localNames, name, at);
        if (previous.length > 0) {
          lisp = `${lisp}-${previous.length + 1}`;
          if (localNames.has(lisp)) fail(`cannot rename '${name}' to '${lisp}'`, at);
          localNames.set(lisp, name);
        }
        variable = { lisp, array, size };
        declared.set(name, [...previous, variable]);
      }
      scope.set(name, variable);
      return { variable, fresh: !reusable };
    };
    for (const param of fn.params) declareLocal(param.name, param.at, param.array);

    const find = (name: string): Variable | undefined => {
      for (let i = scopes.length - 1; i >= 0; i--) {
        const variable = scopes[i].get(name);
        if (variable) return variable;
      }
      return globals.get(name);
    };

    const lookup = (name: string, at: Position): Variable => {
      const variable = find(name);
      if (variable) return variable;
      if (functions.has(name)) fail(`'${name}' is a function, not a variable`, at);
      fail(`'${name}' is not declared`, at);
    };

    const asInt = ({ form, bool }: Typed): SExpr => (bool ? [sym("if"), form, 1, 0] : form);
    const asBool = ({ form, bool }: Typed): SExpr => {
      if (bool) return form;
      if (typeof form === "number") return sym(form !== 0 ? "t" : "nil");
      return [sym("/="), form, 0];
    };
    const int = (expr: Expr): SExpr => asInt(expression(expr));
    const bool = (expr: Expr): SExpr => asBool(expression(expr));

    const variadic = (operator: string, left: SExpr, right: SExpr): SExpr =>
      Array.isArray(left) && left.length > 2 && head(left) === operator
        ? [...left, right]
        : [sym(operator), left, right];

    const call = (expr: Extract<Expr, { kind: "call" }>, needValue: boolean): SExpr => {
      if (["puts", "printf", "putchar"].includes(expr.name)) {
        fail(`${expr.name} can only be used as a statement`, expr.at);
      }
      const target = functions.get(expr.name);
      if (!target) {
        if (find(expr.name)) fail(`'${expr.name}' is a variable, not a function`, expr.at);
        fail(`function '${expr.name}' is not declared`, expr.at);
      }
      if (!target.defined) fail(`function '${expr.name}' is declared but never defined`, expr.at);
      if (expr.args.length !== target.params.length) {
        fail(
          `'${expr.name}' expects ${target.params.length} argument(s) but got ${expr.args.length}`,
          expr.at,
        );
      }
      if (needValue && !target.returnsValue)
        fail(`'${expr.name}' does not return a value`, expr.at);
      const args = expr.args.map((arg, i) => {
        if (!target.params[i].array) return int(arg);
        const variable = arg.kind === "variable" ? find(arg.name) : undefined;
        if (!variable?.array) fail(`argument ${i + 1} of '${expr.name}' must be an array`, arg.at);
        return sym(variable.lisp);
      });
      return [sym(target.lisp), ...args];
    };

    const place = (target: Target): SExpr => {
      const variable = lookup(target.name, target.at);
      if (target.kind === "index") {
        if (!variable.array) fail(`'${target.name}' is not an array`, target.at);
        return [sym("aref"), sym(variable.lisp), int(target.index)];
      }
      if (variable.array) fail(`array '${target.name}' needs an index`, target.at);
      return sym(variable.lisp);
    };

    const assignment = (operator: AssignOperator, target: Target, value: Expr): SExpr => {
      const location = place(target);
      if (operator === "=") {
        const same = (expr: Expr) =>
          expr.kind === "variable" && target.kind === "variable" && expr.name === target.name;
        if (
          value.kind === "binary" &&
          (value.operator === "+" || value.operator === "-") &&
          same(value.left)
        ) {
          const amount = int(value.right);
          const change = [sym(value.operator === "+" ? "incf" : "decf"), location];
          return amount === 1 ? change : [...change, amount];
        }
        return [sym("setf"), location, int(value)];
      }
      if (operator === "+=") return [sym("incf"), location, int(value)];
      if (operator === "-=") return [sym("decf"), location, int(value)];
      const binary: Expr = {
        kind: "binary",
        operator: operator.slice(0, -1) as Extract<Expr, { kind: "binary" }>["operator"],
        left: target,
        right: value,
        at: target.at,
      };
      return [sym("setf"), location, int(binary)];
    };

    const increment = (expr: Extract<Expr, { kind: "increment" }>, needValue: boolean): SExpr => {
      const location = place(expr.target);
      const change: SExpr = [sym(expr.delta > 0 ? "incf" : "decf"), location];
      if (!needValue || expr.prefix) return change;
      return [sym("prog1"), location, change];
    };

    const expression = (expr: Expr): Typed => {
      switch (expr.kind) {
        case "number":
          return { form: expr.value, bool: false };
        case "variable":
          if (!find(expr.name) && (expr.name === "true" || expr.name === "false")) {
            return { form: expr.name === "true" ? 1 : 0, bool: false };
          }
          return { form: place(expr), bool: false };
        case "index":
          return { form: place(expr), bool: false };
        case "call":
          return { form: call(expr, true), bool: false };
        case "assign":
          return { form: assignment(expr.operator, expr.target, expr.value), bool: false };
        case "increment":
          return { form: increment(expr, true), bool: false };
        case "ternary":
          return {
            form: [sym("if"), bool(expr.condition), int(expr.then), int(expr.otherwise)],
            bool: false,
          };
        case "unary": {
          if (expr.operator === "!") {
            const operand = expression(expr.operand);
            if (operand.bool) return { form: [sym("not"), operand.form], bool: true };
            if (typeof operand.form === "number")
              return { form: sym(operand.form === 0 ? "t" : "nil"), bool: true };
            return { form: [sym("="), operand.form, 0], bool: true };
          }
          const operand = int(expr.operand);
          if (expr.operator === "~") return { form: [sym("lognot"), operand], bool: false };
          return {
            form: typeof operand === "number" ? -operand : [sym("-"), operand],
            bool: false,
          };
        }
        case "binary": {
          const { operator } = expr;
          if (operator === "&&" || operator === "||") {
            const name = operator === "&&" ? "and" : "or";
            return { form: variadic(name, bool(expr.left), bool(expr.right)), bool: true };
          }
          const left = int(expr.left);
          const right = int(expr.right);
          if (operator in COMPARISONS) {
            return { form: [sym(COMPARISONS[operator]), left, right], bool: true };
          }
          if (operator === "/") return { form: [sym("truncate"), left, right], bool: false };
          if (operator === "%") return { form: [sym("rem"), left, right], bool: false };
          if (operator === "<<") return { form: [sym("ash"), left, right], bool: false };
          if (operator === ">>") {
            const shift = typeof right === "number" ? -right : [sym("-"), right];
            return { form: [sym("ash"), left, shift], bool: false };
          }
          return { form: variadic(ARITHMETIC[operator], left, right), bool: false };
        }
      }
    };

    const effect = (expr: Expr): SExpr => {
      if (expr.kind === "increment") return increment(expr, false);
      if (expr.kind === "call") return call(expr, false);
      return int(expr);
    };

    const printing = (parts: PrintPart[]): SExpr => {
      if (parts.length === 1 && parts[0].kind === "char") {
        return [sym("write-char"), [sym("code-char"), int(parts[0].value)]];
      }
      let format = "";
      const args: SExpr[] = [];
      for (const part of parts) {
        if (part.kind === "text") format += part.text.replace(/~/g, "~~");
        else if (part.kind === "newline") format += "~%";
        else if (part.kind === "char") {
          format += "~c";
          args.push([sym("code-char"), int(part.value)]);
        } else {
          format += `~${part.width ?? ""}d`;
          args.push(int(part.value));
        }
      }
      return [sym("format"), sym("t"), str(format), ...args];
    };

    const progn = (forms: SExpr[]): SExpr =>
      forms.length === 1 ? forms[0] : [sym("progn"), ...forms];

    const sequence = (stmts: Stmt[], prologue: boolean): SExpr[] => {
      let leading = prologue;
      return stmts.flatMap((stmt) => {
        if (stmt.kind !== "declare") leading = false;
        return statement(stmt, leading);
      });
    };

    const block = (stmts: Stmt[]): SExpr[] => {
      scopes.push(new Map());
      const forms = sequence(stmts, false);
      scopes.pop();
      return forms;
    };

    const loopBody = (body: Stmt): SExpr[] => {
      targets.push("loop");
      const forms = block([body]);
      targets.pop();
      return jumps([body], "continue") ? [[sym("block"), sym("continue"), ...forms]] : forms;
    };

    const declare = (declarator: Declarator, prologue: boolean): SExpr[] => {
      const isArray = declarator.size !== undefined;
      const initial = !isArray && declarator.init ? int(declarator.init) : undefined;
      const values = (declarator.values ?? []).map(int);
      const { variable, fresh } = declareLocal(
        declarator.name,
        declarator.at,
        isArray,
        declarator.size,
      );
      const name = sym(variable.lisp);
      if (isArray) {
        const size = declarator.size as number;
        const inline = prologue && fresh && values.length > 0 && size <= VECTOR_LIMIT;
        if (fresh) bindings.push([name, arrayForm(size, inline ? values : [])]);
        if (inline) return [];
        if (values.length === 0) return [];
        const stores = values.map(
          (value, i): SExpr => [sym("setf"), [sym("aref"), name, i], value],
        );
        const reset =
          (fresh && prologue) || values.length === size ? [] : [[sym("fill"), name, 0] as SExpr];
        return [...reset, ...stores];
      }
      if (!fresh) return initial === undefined ? [] : [[sym("setf"), name, initial]];
      if (prologue || initial === undefined) {
        bindings.push([name, prologue && initial !== undefined ? initial : 0]);
        return [];
      }
      bindings.push([name, 0]);
      return [[sym("setf"), name, initial]];
    };

    const counted = (stmt: Extract<Stmt, { kind: "for" }>): SExpr[] | undefined => {
      const [init] = stmt.init;
      if (stmt.init.length !== 1 || init.kind !== "declare" || init.declarators.length !== 1) {
        return undefined;
      }
      const [declarator] = init.declarators;
      const counter = declarator.name;
      if (declarator.size !== undefined || !declarator.init) return undefined;
      const test = stmt.condition;
      if (test?.kind !== "binary" || !["<", "<=", ">", ">="].includes(test.operator)) {
        return undefined;
      }
      const down = test.operator === ">" || test.operator === ">=";
      if (test.left.kind !== "variable" || test.left.name !== counter) return undefined;
      const [step] = stmt.step;
      if (stmt.step.length !== 1 || (step.kind !== "increment" && step.kind !== "assign")) {
        return undefined;
      }
      if (step.target.kind !== "variable" || step.target.name !== counter) return undefined;
      let stride: number | undefined;
      if (step.kind === "increment" && step.delta === (down ? -1 : 1)) stride = 1;
      if (step.kind === "assign" && step.operator === (down ? "-=" : "+=")) {
        stride = constant(step.value);
      }
      if (stride === undefined || stride < 1 || writes([stmt.body], counter)) return undefined;
      const fixed = (expr: Expr): SExpr | undefined => {
        const literal = constant(expr);
        if (literal !== undefined) return literal;
        if (expr.kind !== "variable" || expr.name === counter) return undefined;
        const variable = find(expr.name);
        if (!variable || variable.array || writes([stmt.body], expr.name)) return undefined;
        const isGlobal = globals.get(expr.name) === variable;
        if (isGlobal && anyExpr([stmt.body], (inner) => inner.kind === "call")) return undefined;
        return sym(variable.lisp);
      };
      const start = fixed(declarator.init);
      const limit = fixed(test.right);
      if (start === undefined || limit === undefined) return undefined;
      const { variable } = declareLocal(counter, declarator.at, false);
      const body = loopBody(stmt.body);
      const name = sym(variable.lisp);
      if (start === 0 && stride === 1 && test.operator === "<") {
        return [[sym("dotimes"), [name, limit], ...body]];
      }
      const keywords: Record<string, string> = {
        "<": "below",
        "<=": "to",
        ">": "above",
        ">=": "downto",
      };
      const end = [sym(keywords[test.operator]), limit];
      const by = stride === 1 ? [] : [sym("by"), stride];
      return [
        [sym("loop"), sym("for"), name, sym("from"), start, ...end, ...by, sym("do"), ...body],
      ];
    };

    const switchForm = (stmt: Extract<Stmt, { kind: "switch" }>): SExpr[] => {
      const value = int(stmt.value);
      const seen = new Set<number>();
      for (const item of stmt.cases) {
        for (const label of item.labels) {
          if (seen.has(label)) fail(`duplicate case label ${label}`, item.at);
          seen.add(label);
        }
      }
      const ends = (body: Stmt[]) => {
        const last = body.at(-1);
        return last?.kind === "break" || last?.kind === "return" || last?.kind === "continue";
      };
      const bodyFrom = (start: number): Stmt[] => {
        const collected: Stmt[] = [];
        for (let i = start; i < stmt.cases.length; i++) {
          collected.push(...stmt.cases[i].body);
          if (ends(stmt.cases[i].body)) break;
        }
        if (collected.at(-1)?.kind === "break") collected.pop();
        return collected;
      };
      const bodies = stmt.cases.map((_, i) => bodyFrom(i));
      targets.push("switch");
      const clause = (item: Case, i: number): SExpr => {
        const forms = block(bodies[i]);
        let key: SExpr = item.labels.length === 1 ? item.labels[0] : item.labels;
        if (item.isDefault) key = sym("otherwise");
        return [key, ...(forms.length ? forms : [sym("nil")])];
      };
      const ordered = stmt.cases
        .map((item, i) => ({ item, i }))
        .sort((a, b) => Number(a.item.isDefault) - Number(b.item.isDefault));
      const clauses = ordered.map(({ item, i }) => clause(item, i));
      targets.pop();
      const form: SExpr = [sym("case"), value, ...clauses];
      return jumps(bodies.flat(), "break") ? [[sym("block"), sym("nil"), form]] : [form];
    };

    const loop = (test: SExpr, body: SExpr[]): SExpr => {
      const forever = isSym(test, "t");
      if (body.length === 0) {
        return [sym("loop"), ...(forever ? [sym("do"), sym("nil")] : [sym("while"), test])];
      }
      return [sym("loop"), ...(forever ? [] : [sym("while"), test]), sym("do"), ...body];
    };

    const statement = (stmt: Stmt, prologue = false): SExpr[] => {
      switch (stmt.kind) {
        case "declare":
          return stmt.declarators.flatMap((declarator) => declare(declarator, prologue));
        case "expression":
          return [effect(stmt.expr)];
        case "print":
          return [printing(stmt.parts)];
        case "block":
          return block(stmt.body);
        case "if": {
          const condition = bool(stmt.condition);
          const then = block([stmt.then]);
          const otherwise = stmt.otherwise ? block([stmt.otherwise]) : [];
          if (otherwise.length === 0) return [[sym("when"), condition, ...then]];
          if (then.length === 0) return [[sym("unless"), condition, ...otherwise]];
          return [[sym("if"), condition, progn(then), progn(otherwise)]];
        }
        case "while":
          return [loop(bool(stmt.condition), loopBody(stmt.body))];
        case "do": {
          const body = loopBody(stmt.body);
          const test = bool(stmt.condition);
          const tail = isSym(test, "t") ? [] : [sym("while"), test];
          return [[sym("loop"), sym("do"), ...(body.length ? body : [sym("nil")]), ...tail]];
        }
        case "for": {
          scopes.push(new Map());
          const optimized = counted(stmt);
          if (optimized) {
            scopes.pop();
            return optimized;
          }
          const init = stmt.init.flatMap((item) => statement(item));
          const condition = stmt.condition ? bool(stmt.condition) : sym("t");
          const body = loopBody(stmt.body);
          const step = stmt.step.map(effect);
          scopes.pop();
          return [...init, loop(condition, [...body, ...step])];
        }
        case "switch":
          return switchForm(stmt);
        case "break":
          if (targets.length === 0) fail("break outside of a loop or switch", stmt.at);
          return [[sym("return")]];
        case "continue":
          if (!targets.includes("loop")) fail("continue outside of a loop", stmt.at);
          return [[sym("return-from"), sym("continue")]];
        case "return":
          if (!stmt.value) {
            if (self.returnsValue) fail(`'${fn.name}' must return a value`, stmt.at);
            return [[sym("return-from"), sym(self.lisp)]];
          }
          return [[sym("return-from"), sym(self.lisp), int(stmt.value)]];
      }
    };

    const stmts = [...statements];
    const last = stmts.at(-1);
    if (last?.kind === "return") {
      if (!last.value && self.returnsValue) fail(`'${fn.name}' must return a value`, last.at);
      stmts.pop();
    }
    const body = sequence(stmts, true);
    if (last?.kind === "return" && last.value) body.push(int(last.value));
    else if (self.returnsValue) body.push(0);
    const params = fn.params.map((param) => sym(lispName(param.name, true)));
    const forms = bindings.length ? [[sym("let*"), bindings, ...body]] : body;
    output.push({ form: [sym("defun"), sym(self.lisp), params, ...forms], group: "defun" });
  };

  let embedded = false;
  for (const item of program.items) {
    if (item.kind === "declare") item.declarators.forEach(declareGlobal);
    else if (item.kind === "function") {
      if (item.body) compileFunction(item, item.body);
    } else {
      embedded = true;
      output.push({ form: item.text, group: "embed" });
    }
  }
  const main = functions.get("main");
  if (!embedded && main?.defined) output.push({ form: [sym(main.lisp)], group: "call" });

  let text = "";
  output.forEach(({ form, group }, i) => {
    const previous = output[i - 1]?.group;
    if (i > 0) text += previous === group && group !== "defun" ? "\n" : "\n\n";
    text += typeof form === "string" ? form : print(form);
  });
  return `${text}\n`;
}

export function compileToLisp(source: string): string {
  return toLisp(parse(source));
}
