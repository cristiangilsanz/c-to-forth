import { cpp } from "@codemirror/lang-cpp";
import { StreamLanguage } from "@codemirror/language";
import { commonLisp } from "@codemirror/legacy-modes/mode/commonlisp";
import { forth } from "@codemirror/legacy-modes/mode/forth";
import { EditorState, type Extension } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, basicSetup } from "codemirror";
import { CompileError, compile, toForth } from "../compiler";
import { runForth } from "../runtime/forth";
import { type RunResult, runLisp } from "../runtime/lisp";
import "./style.css";

const files = import.meta.glob<string>("../../examples/*.c", {
  query: "?raw",
  import: "default",
  eager: true,
});

const examples = [
  ...Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, source]) => {
      const slug =
        path
          .split("/")
          .pop()
          ?.replace(/^\d+-|\.c$/g, "") ?? "";
      const title = slug.replace(/-/g, " ").replace(/^./, (char) => char.toUpperCase());
      return { slug, title, source };
    }),
];

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const picker = element<HTMLSelectElement>("examples");
const problems = element<HTMLPreElement>("problems");
const share = element<HTMLButtonElement>("share");

for (const example of examples) picker.add(new Option(example.title, example.slug));

type Layer = "c" | "lisp" | "forth";

const encode = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const decode = (text: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(text), (char) => char.charCodeAt(0)));

const hash = new URLSearchParams(location.hash.slice(1));
const shared = (["c", "lisp", "forth"] as const)
  .map((layer) => ({ layer, text: hash.get(layer === "c" ? "code" : layer) }))
  .find((entry) => entry.text !== null);

function initialSource(): string {
  const example = examples.find((item) => item.slug === hash.get("example")) ?? examples[0];
  picker.value = shared ? "" : example.slug;
  if (shared?.layer === "c") {
    try {
      return decode(shared.text ?? "");
    } catch {
      history.replaceState(null, "", location.pathname);
    }
  }
  return example.source;
}

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13.5px" },
  ".cm-scroller": { fontFamily: "var(--mono)" },
});

let syncing = false;
let edited: Layer = "c";
const timers: Partial<Record<Layer, number>> = {};

function editor(parent: HTMLElement, language: Extension, layer: Layer, doc = ""): EditorView {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        basicSetup,
        language,
        oneDark,
        theme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((change) => {
          if (!change.docChanged || syncing) return;
          clearTimeout(timers[layer]);
          timers[layer] = window.setTimeout(() => update(layer, change.state.doc.toString()), 250);
        }),
      ],
    }),
  });
}

const replace = (view: EditorView, text: string) => {
  syncing = true;
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
  syncing = false;
};

function show(name: "lisp" | "forth", result: RunResult | undefined, match: boolean): void {
  const output = element<HTMLPreElement>(`${name}-output`);
  const status = element<HTMLSpanElement>(`${name}-status`);
  output.textContent = result ? result.output + (result.error ? `\n${result.error}` : "") : "";
  output.classList.toggle("failed", Boolean(result?.error));
  status.textContent = !result ? "" : result.error ? "error" : match ? "matches" : "differs";
  status.className = `status ${!result ? "" : result.error || !match ? "bad" : "good"}`;
}

function report(messages: string[], failed: boolean): void {
  problems.textContent = messages.length ? messages.join("\n") : "No problems.";
  problems.classList.toggle("failed", failed);
}

const describe = (stage: string, error: unknown) =>
  error instanceof CompileError
    ? `${stage}, line ${error.line}, column ${error.column}: ${error.message}`
    : `${stage}: ${String(error)}`;

function update(layer: Layer, text: string): void {
  edited = layer;
  const notes: string[] = [];
  let lisp: string | undefined;
  let forthCode: string | undefined;
  if (layer === "c") {
    try {
      ({ lisp, forth: forthCode } = compile(text));
      replace(lispView, lisp);
      replace(forthView, forthCode);
    } catch (error) {
      report([describe("C", error)], true);
      show("lisp", undefined, false);
      show("forth", undefined, false);
      return;
    }
  } else if (layer === "lisp") {
    lisp = text;
    notes.push("Running the Lisp you edited. Edit the C to regenerate it.");
    try {
      forthCode = toForth(text);
      replace(forthView, forthCode);
    } catch (error) {
      notes.push(describe("Lisp to Forth", error));
    }
  } else {
    forthCode = text;
    notes.push("Running the Forth you edited. Edit the C or the Lisp to regenerate it.");
  }
  const lispResult = lisp === undefined ? undefined : runLisp(lisp);
  const forthResult = forthCode === undefined ? undefined : runForth(forthCode);
  const match = Boolean(lispResult && forthResult && lispResult.output === forthResult.output);
  show("lisp", lispResult, match || !forthResult);
  show("forth", forthResult, match || !lispResult);
  report(
    notes,
    notes.some((note) => note.includes("line")),
  );
}

const lispView = editor(element("lisp-editor"), StreamLanguage.define(commonLisp), "lisp");
const forthView = editor(element("forth-editor"), StreamLanguage.define(forth), "forth");
const cView = editor(element("c-editor"), cpp(), "c", initialSource());

picker.addEventListener("change", () => {
  const example = examples.find((item) => item.slug === picker.value);
  if (!example) return;
  history.replaceState(null, "", `#example=${example.slug}`);
  replace(cView, example.source);
  update("c", example.source);
});

share.addEventListener("click", async () => {
  const views = { c: cView, lisp: lispView, forth: forthView };
  const key = edited === "c" ? "code" : edited;
  const content = encodeURIComponent(encode(views[edited].state.doc.toString()));
  const link = `${location.origin}${location.pathname}#${key}=${content}`;
  history.replaceState(null, "", link);
  await navigator.clipboard?.writeText(link).catch(() => {});
  share.textContent = "Link copied";
  setTimeout(() => {
    share.textContent = "Copy link";
  }, 1500);
});

update("c", cView.state.doc.toString());
if (shared && shared.layer !== "c") {
  try {
    const text = decode(shared.text ?? "");
    replace(shared.layer === "lisp" ? lispView : forthView, text);
    update(shared.layer, text);
  } catch {
    history.replaceState(null, "", location.pathname);
  }
}
