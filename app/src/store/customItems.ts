import { parseISOString, toLocalISOString } from "../lib/dates";
import { type SqlDriver } from "./driver";

// User-defined trackable items (issue #5). A custom item's entries live in
// the same entries table under kind "custom:<id>" — the prefix can never
// collide with HealthKit identifiers or metric ids. Custom items never
// mirror to a health backend (mirrorable kinds come from the static
// catalog only).

/** "severity" reuses the built-in symptom picker/charts; "rating" is a 1–10
 * scale like the metrics; "event" is a bare "it happened" log (value always
 * 1, charted as weekly counts, excluded from next-up); "numeric" is any
 * number the user types (reps, weight — decimals allowed, charted with a
 * data-derived y-domain); "text" is a per-item quick note (value always 0,
 * text in entries.value_text, listed — not charted — in history). The kind
 * is fixed after creation — changing it would silently redefine what stored
 * values mean. */
export type CustomItemKind =
  "severity" | "rating" | "event" | "numeric" | "text";

/** Short kind label for list rows and pickers. */
export const CUSTOM_KIND_LABELS: Record<CustomItemKind, string> = {
  severity: "Severity",
  rating: "1–10",
  event: "Event",
  numeric: "Number",
  text: "Text",
};

export interface CustomItem {
  id: string;
  name: string;
  icon: string;
  kind: CustomItemKind;
  /** Rating direction, for chart color semantics (mood-style green vs
   * stress-style orange). Always false for severity items. */
  highIsGood: boolean;
  createdAt: Date;
  archivedAt: Date | null;
}

export const CUSTOM_KIND_PREFIX = "custom:";

/** The entry `kind` for a custom item. */
export function customEntryKind(id: string): string {
  return `${CUSTOM_KIND_PREFIX}${id}`;
}

interface CustomItemRow {
  id: string;
  name: string;
  icon: string;
  kind: string;
  high_is_good: number;
  created_at: string;
  archived_at: string | null;
}

function rowToItem(row: CustomItemRow): CustomItem {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    kind: row.kind as CustomItemKind,
    highIsGood: row.high_is_good !== 0,
    createdAt: parseISOString(row.created_at),
    archivedAt:
      row.archived_at === null ? null : parseISOString(row.archived_at),
  };
}

export function listCustomItems(
  db: SqlDriver,
  options: { includeArchived?: boolean } = {},
): CustomItem[] {
  const where = options.includeArchived ? "" : "WHERE archived_at IS NULL";
  // NOCASE: plain ORDER BY name is byte-order ("Zebra" before "apple"),
  // which would disagree with the localeCompare sort the symptom list uses.
  return db
    .all<CustomItemRow>(
      `SELECT * FROM custom_items ${where} ORDER BY name COLLATE NOCASE`,
    )
    .map(rowToItem);
}

export function addCustomItem(
  db: SqlDriver,
  newId: () => string,
  fields: {
    name: string;
    icon: string;
    kind: CustomItemKind;
    highIsGood: boolean;
  },
): CustomItem {
  const item: CustomItem = {
    id: newId(),
    name: fields.name,
    icon: fields.icon,
    kind: fields.kind,
    highIsGood: fields.kind === "rating" && fields.highIsGood,
    createdAt: new Date(),
    archivedAt: null,
  };
  db.run(
    `INSERT INTO custom_items (id, name, icon, kind, high_is_good, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.name,
      item.icon,
      item.kind,
      item.highIsGood ? 1 : 0,
      toLocalISOString(item.createdAt),
    ],
  );
  return item;
}

/** Name, icon, and rating direction are editable; the kind is not (stored
 * values would silently change meaning). */
export function updateCustomItem(
  db: SqlDriver,
  id: string,
  fields: { name: string; icon: string; highIsGood: boolean },
): void {
  db.run(
    `UPDATE custom_items
     SET name = ?, icon = ?,
         high_is_good = CASE kind WHEN 'rating' THEN ? ELSE 0 END
     WHERE id = ?`,
    [fields.name, fields.icon, fields.highIsGood ? 1 : 0, id],
  );
}

/** Soft delete: the item leaves every screen, its entries stay. */
export function archiveCustomItem(db: SqlDriver, id: string): void {
  db.run(
    `UPDATE custom_items SET archived_at = ? WHERE id = ? AND archived_at IS NULL`,
    [toLocalISOString(new Date()), id],
  );
}
