import { describe, expect, test } from "vitest";
import { compile, toForth } from "../src/compiler";
import { runForth } from "../src/runtime/forth";
import { runLisp } from "../src/runtime/lisp";
import {
  course,
  examples,
  expected,
  forthPrograms,
  lispOnlyPrograms,
  lispPrograms,
} from "./programs";

describe.each([...examples, ...course])("C program $name", ({ name, source, output }) => {
  const compiled = compile(source);

  test("compiles to the expected Lisp", async () => {
    await expect(compiled.lisp).toMatchFileSnapshot(expected(name, "lisp"));
  });

  test("compiles to the expected Forth", async () => {
    await expect(compiled.forth).toMatchFileSnapshot(expected(name, "fs"));
  });

  test("runs the Lisp with the expected output", () => {
    expect(runLisp(compiled.lisp)).toEqual({ output });
  });

  test("runs the Forth with the expected output", () => {
    expect(runForth(compiled.forth)).toEqual({ output });
  });
});

describe.each(lispPrograms)("Lisp program $name", ({ name, source, output }) => {
  test("runs with the expected output", () => {
    expect(runLisp(source)).toEqual({ output });
  });

  test("translates to the expected Forth", async () => {
    await expect(toForth(source)).toMatchFileSnapshot(expected(name, "fs"));
  });

  test("runs the Forth with the expected output", () => {
    expect(runForth(toForth(source))).toEqual({ output });
  });
});

describe.each(lispOnlyPrograms)("Lisp program $name", ({ source, output }) => {
  test("runs with the expected output", () => {
    expect(runLisp(source)).toEqual({ output });
  });
});

describe.each(forthPrograms)("Forth program $name", ({ source, output }) => {
  test("runs with the expected output", () => {
    expect(runForth(source)).toEqual({ output });
  });
});
