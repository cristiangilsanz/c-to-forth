import { toForth } from "./forth";
import { compileToLisp } from "./lisp";

export { CompileError } from "./errors";
export { toForth } from "./forth";
export { compileToLisp } from "./lisp";

export interface Compiled {
  lisp: string;
  forth: string;
}

export function compile(source: string): Compiled {
  const lisp = compileToLisp(source);
  return { lisp, forth: toForth(lisp) };
}
