// The built-in quick-note tile (issue #5): free-text one-off entries with no
// definition step. Entries use kind "note", value 0, and the text in
// value_text. No chart, no next-up, never mirrored to a health backend.

export const NOTE_KIND = "note";

export const NOTE = { id: NOTE_KIND, name: "Quick Note", icon: "📝" } as const;
