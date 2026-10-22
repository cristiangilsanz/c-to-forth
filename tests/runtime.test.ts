import { describe, expect, test } from "vitest";
import { runForth } from "../src/runtime/forth";
import { runLisp } from "../src/runtime/lisp";

describe("Lisp interpreter", () => {
  test("print, prin1 and princ match clisp", () => {
    expect(runLisp('(print "a") (prin1 "b") (princ "c") (print 1)').output).toBe('\n"a" "b"c\n1 ');
  });

  test("integers never overflow", () => {
    expect(runLisp('(format t "~d" (* 99999999999 99999999999))').output).toBe(
      "9999999999800000000001",
    );
  });

  test("mod is floored and rem is truncated", () => {
    expect(runLisp('(format t "~d ~d" (mod -7 2) (rem -7 2))').output).toBe("1 -1");
  });

  test("arrays start with the initial element", () => {
    expect(runLisp("(setq v (make-array 3 :initial-element 0)) (prin1 v)").output).toBe("#(0 0 0)");
  });

  test("errors keep the output printed so far", () => {
    expect(runLisp('(format t "before") (format t "~d" missing)')).toEqual({
      output: "before",
      error: "EVAL: variable MISSING has no value",
    });
    expect(runLisp("(truncate 1 0)").error).toBe("TRUNCATE: division by zero");
    expect(runLisp("(nope)").error).toBe("EVAL: undefined function NOPE");
  });

  test("infinite loops and runaway recursion are stopped", () => {
    expect(runLisp("(loop do 1)", { maxSteps: 1000 }).error).toBe("stopped after 1,000 steps");
    expect(runLisp("(defun f () (f)) (f)").error).toBe("Program stack overflow");
  });
});

describe("Forth interpreter", () => {
  test("division is floored like gforth", () => {
    expect(runForth("-7 2 / . -7 2 mod .").output).toBe("-4 1 ");
  });

  test("cells wrap around at 64 bits", () => {
    expect(runForth("9223372036854775807 1 + .").output).toBe("-9223372036854775808 ");
  });

  test("values, arrays and the return stack work", () => {
    const source =
      "5 value x  create a 3 cells allot  a 3 cells erase\n7 a 2 cells + !  : f x >r 9 to x x r> ;  f . . a 2 cells + @ .";
    expect(runForth(source).output).toBe("5 9 7 ");
  });

  test("comments are skipped", () => {
    expect(runForth("( a comment ) 1 . \\ the rest of the line\n2 .").output).toBe("1 2 ");
  });

  test("control structures compile to jumps", () => {
    const source =
      ': count 0 begin dup 3 < while dup . 1 + repeat drop ; : sign 0< if ." neg" else ." pos" then ; count -1 sign 1 sign';
    expect(runForth(source).output).toBe("0 1 2 negpos");
  });

  test("errors are reported like gforth", () => {
    expect(runForth("1 nope").error).toBe("Undefined word nope");
    expect(runForth("drop").error).toBe("Stack underflow");
    expect(runForth("1 0 /").error).toBe("Division by zero");
    expect(runForth(": f if ;").error).toBe("Unstructured control flow");
  });

  test("infinite loops and runaway recursion are stopped", () => {
    expect(runForth(": f begin again ; f", { maxSteps: 1000 }).error).toBe(
      "stopped after 1,000 steps",
    );
    expect(runForth(": f recurse ; f").error).toBe("Return stack overflow");
  });
});
