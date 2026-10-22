import type { Position } from "./errors";

export type BinaryOperator =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "<<"
  | ">>"
  | "&"
  | "|"
  | "^"
  | "<"
  | ">"
  | "<="
  | ">="
  | "=="
  | "!="
  | "&&"
  | "||";

export type AssignOperator =
  | "="
  | "+="
  | "-="
  | "*="
  | "/="
  | "%="
  | "<<="
  | ">>="
  | "&="
  | "|="
  | "^=";

export type Expr =
  | { kind: "number"; value: number; at: Position }
  | { kind: "variable"; name: string; at: Position }
  | { kind: "index"; name: string; index: Expr; at: Position }
  | { kind: "call"; name: string; args: Expr[]; at: Position }
  | { kind: "unary"; operator: "-" | "!" | "~"; operand: Expr; at: Position }
  | { kind: "binary"; operator: BinaryOperator; left: Expr; right: Expr; at: Position }
  | { kind: "ternary"; condition: Expr; then: Expr; otherwise: Expr; at: Position }
  | { kind: "assign"; operator: AssignOperator; target: Target; value: Expr; at: Position }
  | { kind: "increment"; target: Target; delta: 1 | -1; prefix: boolean; at: Position };

export type Target = Extract<Expr, { kind: "variable" | "index" }>;

export type PrintPart =
  | { kind: "text"; text: string }
  | { kind: "number"; value: Expr; width?: number }
  | { kind: "char"; value: Expr }
  | { kind: "newline" };

export interface Declarator {
  name: string;
  size?: number;
  init?: Expr;
  values?: Expr[];
  at: Position;
}

export interface Case {
  labels: number[];
  isDefault: boolean;
  body: Stmt[];
  at: Position;
}

export type Stmt =
  | { kind: "declare"; declarators: Declarator[]; at: Position }
  | { kind: "expression"; expr: Expr; at: Position }
  | { kind: "print"; parts: PrintPart[]; at: Position }
  | { kind: "block"; body: Stmt[]; at: Position }
  | { kind: "if"; condition: Expr; then: Stmt; otherwise?: Stmt; at: Position }
  | { kind: "while"; condition: Expr; body: Stmt; at: Position }
  | { kind: "do"; body: Stmt; condition: Expr; at: Position }
  | { kind: "for"; init: Stmt[]; condition?: Expr; step: Expr[]; body: Stmt; at: Position }
  | { kind: "switch"; value: Expr; cases: Case[]; at: Position }
  | { kind: "break"; at: Position }
  | { kind: "continue"; at: Position }
  | { kind: "return"; value?: Expr; at: Position };

export interface Param {
  name: string;
  array: boolean;
  at: Position;
}

export interface FunctionDef {
  kind: "function";
  name: string;
  returns: "int" | "void" | "implicit";
  params: Param[];
  body?: Stmt[];
  at: Position;
}

export type TopLevel =
  | FunctionDef
  | { kind: "declare"; declarators: Declarator[]; at: Position }
  | { kind: "embed"; text: string; at: Position };

export interface Program {
  items: TopLevel[];
}
