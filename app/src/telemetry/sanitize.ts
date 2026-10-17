// Error text is the one free-form thing telemetry sends, so it is scrubbed
// here before anything leaves the device. The rule is "when in doubt, leave
// it out": anything that could carry an entry's value, a comment, a note, a
// custom item's name, a file name or a date is replaced, and what survives
// is capped. Stacks keep only frame locations (function + file basename +
// line/column), never the message line most engines prepend.

export const MAX_MESSAGE_LENGTH = 200;
export const MAX_FRAMES = 30;
const MAX_TYPE_LENGTH = 64;
const MAX_FUNCTION_LENGTH = 80;

const REPLACEMENTS: [RegExp, string][] = [
  // URIs and absolute paths: file names (an import's picked document, the
  // export's dated file) and container paths.
  [/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "<uri>"],
  [/(^|[\s(])\/[^\s)]+/g, "$1<path>"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "<email>"],
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "<id>",
  ],
  // A specific symptom type is health data in itself.
  [/\bHK[A-Za-z]*Identifier[A-Za-z]+/g, "<hk-type>"],
  // Quoted text is data (V8's JSON errors quote the input, ours quote
  // values). Single quotes open only after a non-letter, so a contraction's
  // apostrophe can't pair with a quote; the one kind of single-quoted text
  // kept is a lower-camel identifier — how engines and Expo name
  // properties and functions ('length', 'saveCategorySample').
  [/"[^"]*"/g, '"…"'],
  [/[“«][^”»]*[”»]/g, '"…"'],
  [/(?<![A-Za-z])'(?![a-z_$][\w$]{0,39}'(?![A-Za-z]))[^'\n]*'/g, "'…'"],
  [/`[^`]*`/g, "`…`"],
  // Dates and times, then any other number: entry values, ratings,
  // timestamps. Only digits that end an identifier (v7, utf8) survive.
  [
    /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?(?:Z|[+-]\d{2}:?\d{2})?/g,
    "<date>",
  ],
  [/(?<![A-Za-z_])\d+(?:[.,:]\d+)*/g, "#"],
];

export function sanitizeMessage(raw: string): string {
  let message = raw;
  for (const [pattern, replacement] of REPLACEMENTS) {
    message = message.replace(pattern, replacement);
  }
  message = message.replace(/\s+/g, " ").trim();
  return message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH - 1)}…`
    : message;
}

/** An error's class name, if it looks like one; never free text. */
export function sanitizeErrorType(name: unknown): string {
  return typeof name === "string" &&
    name.length <= MAX_TYPE_LENGTH &&
    /^[A-Za-z_$][\w$.]*$/.test(name)
    ? name
    : "Error";
}

export type StackFrame = {
  platform: "web:javascript";
  function: string;
  filename: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
};

// "at fn (file:1:2)", "at file:1:2", Hermes' "at fn (address at file:1:2)",
// and JSC's "fn@file:1:2".
const V8_FRAME =
  /^\s*at (?:(.+?) \()?(?:address at )?(.*?)(?::(\d+))?(?::(\d+))?\)?\s*$/;
const JSC_FRAME = /^\s*(.*?)@(.*?)(?::(\d+))?(?::(\d+))?\s*$/;

// Metro's dev bundle URLs put their query after "//&".
function basename(file: string): string {
  const withoutQuery = file.split(/[?#]|\/\/&/)[0];
  const name = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  return /^[\w.-]{1,100}$/.test(name) ? name : "";
}

function cleanFunction(name: string | undefined): string {
  if (!name) return "?";
  return /^[\w$.<>[\]?]+$/.test(name)
    ? name.slice(0, MAX_FUNCTION_LENGTH)
    : "?";
}

function toNumber(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value);
}

/** Frame locations from a JS stack, outermost caller first (the order
 * PostHog's raw stack traces use). Engines start the stack with the
 * message, which may span lines that look like frames, so it is cut off
 * first (`message`), and anything else that isn't a frame is dropped. */
export function parseStack(stack: string, message = ""): StackFrame[] {
  const frames: StackFrame[] = [];
  const index = message ? stack.indexOf(message) : -1;
  const framesOnly = index === -1 ? stack : stack.slice(index + message.length);
  for (const line of framesOnly.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.startsWith("at ")
      ? V8_FRAME.exec(trimmed)
      : /^[^\s]*@/.test(trimmed)
        ? JSC_FRAME.exec(trimmed)
        : null;
    if (!match) continue;
    const [, fn, file, line_, column] = match;
    const filename = basename(file ?? "");
    if (!filename) continue;
    frames.push({
      platform: "web:javascript",
      function: cleanFunction(fn),
      filename,
      lineno: toNumber(line_),
      colno: toNumber(column),
      in_app: filename !== "native" && filename !== "[native code]",
    });
    if (frames.length === MAX_FRAMES) break;
  }
  return frames.reverse();
}
