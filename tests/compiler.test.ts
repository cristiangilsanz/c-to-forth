import { describe, expect, test } from "vitest";
import { CompileError, compile, compileToLisp, toForth } from "../src/compiler";
import { read } from "../src/compiler/sexpr";
import { runForth } from "../src/runtime/forth";
import { runLisp } from "../src/runtime/lisp";

const program = (body: string, before = "") => `${before}\nint main() {\n${body}\n}\n`;

const outputs = (source: string) => {
  const { lisp, forth } = compile(source);
  const viaLisp = runLisp(lisp);
  const viaForth = runForth(forth);
  expect(viaForth).toEqual(viaLisp);
  return viaLisp.output;
};

const error = (source: string): CompileError => {
  try {
    compile(source);
  } catch (caught) {
    if (caught instanceof CompileError) return caught;
    throw caught;
  }
  throw new Error("expected a compile error");
};

describe("semantics", () => {
  test("integer division and remainder truncate toward zero like C", () => {
    const source = program('printf("%d %d %d %d", -7 / 2, -7 % 2, 7 / -2, 7 % -2);');
    expect(outputs(source)).toBe("-3 -1 -3 1");
  });

  test("comparisons become 1 or 0 when used as numbers", () => {
    expect(outputs(program('printf("%d %d %d", 3 < 4, 3 == 4, !0);'))).toBe("1 0 1");
  });

  test("numbers are true when they are not zero", () => {
    const source = program('int n = 3;\nwhile (n) { printf("%d", n); n--; }\nif (!n) puts("!");');
    expect(outputs(source)).toBe("321!\n");
  });

  test("logical operators combine conditions", () => {
    const source = program('int a = 1, b = 0;\nprintf("%d %d", a && b, a || b);');
    expect(outputs(source)).toBe("0 1");
  });

  test("compound assignments and increments update variables", () => {
    const source = program(
      'int x = 10;\nx += 5; x -= 3; x *= 2; x /= 4; x %= 4; x++; ++x; x--;\nprintf("%d", x);',
    );
    expect(outputs(source)).toBe("3");
  });

  test("for loops without a condition run until they return", () => {
    const source = "int first() {\nfor (int i = 0;; i++) { if (i * i > 50) return i; }\n}\n";
    expect(outputs(`${source}${program('printf("%d", first());')}`)).toBe("8");
  });

  test("recursion keeps each call's parameters and locals", () => {
    const source =
      "int sum(int n) {\nint rest;\nif (n == 0) return 0;\nrest = sum(n - 1);\nreturn n + rest;\n}\n";
    expect(outputs(`${source}${program('printf("%d", sum(100));')}`)).toBe("5050");
  });

  test("printf supports escapes, %% and several values", () => {
    expect(outputs(program('printf("%d%% of %d\\tdone\\n", 50, 8);'))).toBe("50% of 8\tdone\n");
  });

  test("text with quotes and tildes survives both translations", () => {
    expect(outputs(program('puts("say \\"hi\\" ~ bye");'))).toBe('say "hi" ~ bye\n');
  });

  test("character literals are numbers", () => {
    expect(outputs(program("printf(\"%d\", 'A');"))).toBe("65");
  });

  test("sibling blocks can declare the same name", () => {
    const source = program(
      'for (int i = 0; i < 2; i++) printf("%d", i);\nfor (int i = 5; i < 7; i++) printf("%d", i);',
    );
    expect(outputs(source)).toBe("0156");
  });

  test("inner blocks can shadow outer variables", () => {
    const source = program('int x = 1;\nif (x) { int x = 2; printf("%d", x); }\nprintf("%d", x);');
    expect(compileToLisp(source)).toContain("x-2");
    expect(outputs(source)).toBe("21");
  });

  test("locals and parameters shadow globals", () => {
    const source = "int a = 1;\nint f(int a) { return a * 10; }\n";
    expect(outputs(`${source}${program('printf("%d %d", f(5), a);')}`)).toBe("50 1");
  });

  test("main runs automatically unless the program embeds Lisp", () => {
    expect(compileToLisp(program('puts("x");')).trim().endsWith("(main)")).toBe(true);
    const embedded = `${program('puts("x");')}//@ (main)\n//@ (main)\n`;
    expect(outputs(embedded)).toBe("x\nx\n");
  });

  test("lines starting with # are ignored", () => {
    expect(outputs(`#include <stdio.h>\n#define X 1\n${program('puts("ok");')}`)).toBe("ok\n");
  });
});

describe("more C", () => {
  test("switch supports fallthrough and default anywhere", () => {
    const body = [
      "for (int i = 0; i < 5; i++) {",
      "switch (i) {",
      'default: printf("d");',
      'case 1: printf("1"); break;',
      'case 3: printf("3");',
      'case 4: printf("4");',
      "}",
      "}",
    ].join("\n");
    expect(outputs(program(body))).toBe("d11d1344");
  });

  test("break inside a switch leaves only the switch", () => {
    const body = [
      "for (int i = 0; i < 3; i++) {",
      'switch (i) { case 1: if (i) break; printf("x"); default: printf("%d", i); }',
      "}",
    ].join("\n");
    expect(outputs(program(body))).toBe("02");
  });

  test("continue in a for loop still runs the step", () => {
    const body = 'for (int i = 0; i < 6; i++) { if (i % 3) continue; printf("%d", i); }';
    expect(outputs(program(body))).toBe("03");
  });

  test("do while runs at least once", () => {
    expect(outputs(program('int n = 9;\ndo { printf("%d", n); n++; } while (n < 3);'))).toBe("9");
  });

  test("assignments and increments are expressions", () => {
    const body = [
      "int a, b, c = 5;",
      "a = b = c++;",
      'printf("%d %d %d %d ", a, b, c, ++c);',
      "int i = 0;",
      "int v[3];",
      "v[i++] = 7;",
      'printf("%d %d", v[0], i);',
    ].join("\n");
    expect(outputs(program(body))).toBe("5 5 6 7 7 1");
  });

  test("the ternary operator picks a value", () => {
    const body = 'for (int i = 0; i < 4; i++) printf("%d", i % 2 ? -i : i * 10);';
    expect(outputs(program(body))).toBe("0-120-3");
  });

  test("bitwise operators work like C", () => {
    const body =
      'int x = 0x5A;\nx ^= 0xFF; x <<= 2; x |= 1; x &= ~4; x >>= 1;\nprintf("%d %d", x, -1 >> 3);';
    expect(outputs(program(body))).toBe("328 -1");
  });

  test("arrays can be initialized and passed to functions", () => {
    const helper =
      "int total(int a[], int n) { int s = 0; for (int i = 0; i < n; i++) s += a[i]; return s; }\n";
    const body =
      'int v[5] = {1, 2, 3};\nint w[] = {10, 20};\nprintf("%d %d", total(v, 5), total(w, 2));';
    expect(outputs(program(body, helper))).toBe("6 30");
  });

  test("functions can call each other before they are defined", () => {
    const source = [
      "int ping(int n);",
      "int pong(int n) { return n ? ping(n - 1) + 1 : 0; }",
      "int ping(int n) { return n ? pong(n - 1) * 2 : 0; }",
    ].join("\n");
    expect(outputs(`${source}${program('printf("%d", pong(5));')}`)).toBe("7");
  });

  test("characters, widths and putchar print like C", () => {
    const body = "putchar('h'); putchar(105);\nprintf(\"%c[%4d]%s\", 'A' + 2, 42, \"!\");";
    expect(outputs(program(body))).toBe("hiC[  42]!");
  });

  test("hex and octal literals, casts and bool work", () => {
    const body = 'bool ok = true;\nprintf("%d %d %d %d", 0x1F, 010, (int) 7, ok);';
    expect(outputs(program(body))).toBe("31 8 7 1");
  });

  test("simple counting loops become dotimes or loop for", () => {
    const lisp = compileToLisp(program('for (int i = 0; i < 3; i++) printf("%d", i);'));
    expect(lisp).toContain("(dotimes (i 3)");
    const stepped = compileToLisp(program('for (int i = 2; i <= 8; i += 3) printf("%d", i);'));
    expect(stepped).toContain("(loop for i from 2 to 8 by 3 do");
    expect(outputs(program('for (int i = 2; i <= 8; i += 3) printf("%d", i);'))).toBe("258");
  });
});

describe("names", () => {
  test("camelCase names become kebab-case", () => {
    const source = "int maxValue = 4;\nint doubleIt(int someNumber) { return someNumber * 2; }\n";
    const lisp = compileToLisp(`${source}${program('printf("%d", doubleIt(maxValue));')}`);
    expect(lisp).toContain("(setq max-value 4)");
    expect(lisp).toContain("(defun double-it (some-number)");
  });

  test("Common Lisp functions and gforth words are never redefined", () => {
    const source = program("describe(2);", 'void describe(int sign) { printf("%d", sign); }\n');
    const { lisp, forth } = compile(source);
    expect(lisp).toContain("(defun describe_ (sign)");
    expect(forth).toContain("describe_.sign");
    expect(compile(program("table(1);", "void table(int n) { }\n")).forth).toContain(": table_");
    expect(outputs(source)).toBe("2");
  });

  test("names that clash with Lisp constants get a suffix", () => {
    const source = "int t;\nint max(int a, int b) { if (a > b) return a; return b; }\n";
    const full = `${source}${program('t = max(3, 9);\nprintf("%d", t);')}`;
    expect(compileToLisp(full)).toContain("(defun max_ (a b)");
    expect(outputs(full)).toBe("9");
  });

  test("names that clash with Forth get a suffix", () => {
    const source = program('printf("%d", drop(4));', "int drop(int x) { return x + 1; }\n");
    expect(compile(source).forth).toContain(": drop_");
    expect(outputs(source)).toBe("5");
  });
});

describe("errors", () => {
  test.each([
    ["int main() { x = 1; }", "'x' is not declared", 1, 14],
    ["int main() { f(); }", "function 'f' is not declared", 1, 14],
    ["int f(int a);\nint main() { f(1); }", "function 'f' is declared but never defined", 2, 14],
    [
      "int f(int a) { return a; }\nint main() { f(); }",
      "'f' expects 1 argument(s) but got 0",
      2,
      14,
    ],
    ["void f() { }\nint main() { int x = f(); }", "'f' does not return a value", 2, 22],
    ["void f() { return 1; }", "void function 'f' cannot return a value", 1, 6],
    ["int a[3];\nint main() { a = 1; }", "array 'a' needs an index", 2, 14],
    ["int a;\nint main() { a[0] = 1; }", "'a' is not an array", 2, 14],
    ["void f(int a[]) { }\nint main() { f(3); }", "argument 1 of 'f' must be an array", 2, 16],
    ["int main() { int x; int x; }", "'x' is already declared in this scope", 1, 25],
    ["int a = 1;\nint b = a;", "global variables need a constant value", 2, 9],
    ["int main() { break; }", "break outside of a loop or switch", 1, 14],
    ["int main() { switch (1) { case 1: continue; } }", "continue outside of a loop", 1, 35],
    ["int main() { switch (1) { case 1: case 1: break; } }", "duplicate case label 1", 1, 27],
    [
      "int main() { int n = 2; switch (1) { case n: break; } }",
      "case label must be a constant",
      1,
      43,
    ],
    ['int main() { printf("%s", 1); }', "%s needs a string literal", 1, 27],
    ['int main() { printf("%x", 1); }', "printf does not support %x", 1, 21],
    ['int main() { printf("%d"); }', "printf needs a value for %d", 1, 21],
    ["int main() { puts(1); }", "puts expects a string", 1, 19],
    ["int main() { int x = printf(1); }", "printf can only be used as a statement", 1, 22],
    ["int main() { if (1) { }", "missing closing '}'", 1, 12],
    ["int main() { return 1 }", "expected ';' but found '}'", 1, 23],
    ["int main() { @ }", "unexpected character '@'", 1, 14],
    ['int main() { puts("a); }', "unterminated string", 1, 19],
    ["int Total;\nint total;", "'total' and 'Total' would both become 'total' in Lisp", 2, 5],
  ])("%s", (source, message, line, column) => {
    const caught = error(source);
    expect(caught.message).toBe(message);
    expect([caught.line, caught.column]).toEqual([line, column]);
  });
});

describe("Lisp to Forth", () => {
  test("hand-written Lisp can be translated", () => {
    const lisp =
      '(setq n 3)\n(defun twice (x) (* x 2))\n(defun main () (format t "~d~%" (twice n)))\n(main)';
    const forth = toForth(lisp);
    expect(forth).toContain(": twice\n  to twice.x\n  twice.x 2 * ;");
    expect(runForth(forth).output).toBe("6\n");
  });

  test("idiomatic Lisp becomes idiomatic Forth", () => {
    const lisp =
      "(defun sum-to (n) (let ((total 0)) (dotimes (i n) (incf total i)) total))\n(print (sum-to 10))";
    const forth = toForth(lisp);
    expect(forth).toContain("sum-to.n 0 max 0 ?do sum-to.total i + to sum-to.total loop");
    expect(runForth(forth).output).toBe("\n45 ");
  });

  test("functions defined later are deferred", () => {
    const lisp = "(defun a (n) (if (= n 0) 0 (b (- n 1))))\n(defun b (n) (a n))\n(print (a 3))";
    const forth = toForth(lisp);
    expect(forth).toContain("defer b");
    expect(forth).toContain(":noname");
    expect(runForth(forth).output).toBe("\n0 ");
  });

  test("unsupported forms are reported", () => {
    expect(() => toForth("(defun f () (car (list 1 2)))")).toThrow("car is not supported in Forth");
    expect(() => toForth("(defun f () (loop for x in y do (print x)))")).toThrow(
      "loop in is not supported in Forth",
    );
    expect(() => toForth("(defun f () (print missing))")).toThrow("unknown variable 'missing'");
    expect(() => toForth("(nope)")).toThrow("unknown function 'nope'");
  });

  test("the reader rejects broken input", () => {
    expect(() => read("(a (b)")).toThrow("missing closing parenthesis");
    expect(() => read(")")).toThrow("unexpected closing parenthesis");
  });
});
