import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { compile, toForth } from "../src/compiler";
import { course, examples, forthPrograms, lispOnlyPrograms, lispPrograms } from "./programs";

const available = (tool: string) => {
  try {
    execFileSync(tool, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const hasClisp = available("clisp");
const hasGforth = available("gforth");
const hasGcc = available("gcc");

const run = (command: string, args: string[]) =>
  execFileSync(command, args, { encoding: "utf8", timeout: 30_000 }).replace(/\r\n/g, "\n");

const directory = mkdtempSync(join(tmpdir(), "c-to-forth-"));

const clisp = (name: string, source: string) => {
  const file = join(directory, `${name}.lisp`);
  writeFileSync(file, source);
  return run("clisp", [file]);
};

const gforth = (name: string, source: string) => {
  const file = join(directory, `${name}.fs`);
  writeFileSync(file, source);
  return run("gforth", [file, "-e", "bye"]);
};

const freshLine = (output: string) =>
  output === "" || output.endsWith("\n") ? output : `${output}\n`;

describe.each([...examples, ...course])(
  "C program $name on real toolchains",
  ({ name, source, path, output }) => {
    const compiled = compile(source);

    test.skipIf(!hasClisp)("clisp prints the expected output", () => {
      expect(clisp(name, compiled.lisp)).toBe(freshLine(output));
    });

    test.skipIf(!hasGforth)("gforth prints the expected output", () => {
      expect(gforth(name, compiled.forth)).toBe(output);
    });

    test.skipIf(name.startsWith("course-") || !hasGcc)(
      "gcc builds a program with the same output",
      () => {
        const binary = join(directory, name);
        run("gcc", ["-std=c99", "-Wall", "-Werror", "-o", binary, path]);
        expect(run(binary, [])).toBe(output);
      },
    );
  },
);

describe.each(lispPrograms)("Lisp program $name on real toolchains", ({ name, source, output }) => {
  test.skipIf(!hasClisp)("clisp prints the expected output", () => {
    expect(clisp(name, source)).toBe(freshLine(output));
  });

  test.skipIf(!hasGforth)("gforth runs the translation with the same output", () => {
    expect(gforth(name, toForth(source))).toBe(output);
  });
});

describe.each(lispOnlyPrograms)(
  "Lisp program $name on real toolchains",
  ({ name, source, output }) => {
    test.skipIf(!hasClisp)("clisp prints the expected output", () => {
      expect(clisp(name, source)).toBe(output);
    });
  },
);

describe.each(forthPrograms)(
  "Forth program $name on real toolchains",
  ({ name, source, output }) => {
    test.skipIf(!hasGforth)("gforth prints the expected output", () => {
      expect(gforth(name, source)).toBe(output);
    });
  },
);
