import { readFileSync, readdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

export interface TestProgram {
  name: string;
  path: string;
  source: string;
  output: string;
}

const root = join(import.meta.dirname, "..");

function load(directory: string, prefix: string): TestProgram[] {
  return readdirSync(join(root, directory))
    .filter((file) => [".c", ".lisp", ".fs"].includes(extname(file)))
    .sort()
    .map((file) => {
      const name = `${prefix}${basename(file, extname(file))}`;
      const path = join(root, directory, file);
      return {
        name,
        path,
        source: readFileSync(path, "utf8"),
        output: readFileSync(join(root, "tests", "expected", `${name}.out`), "utf8"),
      };
    });
}

export const examples = load("examples", "");
export const course = load(join("tests", "fixtures", "course"), "course-");
export const lispPrograms = load(join("tests", "fixtures", "lisp"), "lisp-");
export const lispOnlyPrograms = load(join("tests", "fixtures", "lisp-only"), "lisponly-");
export const forthPrograms = load(join("tests", "fixtures", "forth"), "forth-");

export const expected = (name: string, extension: string) =>
  join(root, "tests", "expected", `${name}.${extension}`);
