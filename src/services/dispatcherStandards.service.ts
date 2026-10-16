import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

export const STANDARDS_KEY = "dispatcher.standards.v1";
export const standardFields = z.object({
  title: z.string().trim().min(1).max(140),
  expectation: z.string().trim().min(1).max(3000),
  consequence: z.string().trim().min(1).max(3000),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
}).strict();
const entrySchema = standardFields.extend({
  id: z.uuid(), updatedAt: z.iso.datetime().nullable(), updatedBy: z.string().max(250).nullable(),
});
const boardSchema = z.object({ version: z.number().int().nonnegative(), entries: z.array(entrySchema).max(100) }).strict();
type Board = z.infer<typeof boardSchema>;
export type StandardFields = z.infer<typeof standardFields>;

// Proposals only. Neither starter fee is published or enforced automatically.
const initialBoard: Board = {
  version: 0,
  entries: [
    {
      id: "1796c14a-16cc-4cb7-951a-44773ba66e10", title: "Dispatch calls within five minutes",
      expectation: "Dispatch each call within five minutes of receiving it.",
      consequence: "Proposed: a $10 disciplinary fee if a call takes longer than five minutes to dispatch.",
      status: "DRAFT", updatedAt: null, updatedBy: null,
    },
    {
      id: "4f789b97-d4c0-4ddf-8967-eae073575413", title: "Avoid duplicate catalog entries",
      expectation: "Check the catalog for an existing item before creating a new entry. Do not create duplicate entries.",
      consequence: "Proposed: a $10 removal fee for a duplicate catalog entry.",
      status: "DRAFT", updatedAt: null, updatedBy: null,
    },
  ],
};

export async function readStandards() {
  const row = await prisma.systemSetting.findUnique({ where: { key: STANDARDS_KEY } });
  if (!row) return { raw: null, board: structuredClone(initialBoard) };
  try {
    const board = boardSchema.parse(JSON.parse(row.value));
    if (new Set(board.entries.map(entry => entry.id)).size !== board.entries.length) throw new Error("Duplicate IDs");
    return { raw: row.value, board };
  } catch {
    // Never replace unreadable saved policy with the starter drafts.
    throw new ApiError(503, "Dispatcher standards could not be loaded. Please contact the administrator.");
  }
}

export function presentStandards(board: Board, canEdit: boolean) {
  return { version: board.version, canEdit, entries: board.entries.filter(entry => canEdit || entry.status === "PUBLISHED") };
}

export async function saveStandard(input: {
  id: string; version: number; fields: StandardFields; editorName: string; create: boolean;
}) {
  const { raw, board } = await readStandards();
  const existing = board.entries.find(entry => entry.id === input.id);
  // A retry after a lost response must not create a duplicate entry.
  if (input.create && existing) {
    if (Object.entries(input.fields).every(([key, value]) => existing[key as keyof StandardFields] === value)) return board;
    throw new ApiError(409, "This entry already exists. Refresh the standards before editing it.");
  }
  if (!input.create && !existing) throw new ApiError(404, "Entry not found. Refresh the standards.");
  const conflict = () => new ApiError(409, "Another administrator changed the standards. Copy any unsaved text, cancel this edit, refresh, and reopen the entry.");
  if (board.version !== input.version) throw conflict();
  if (input.create && board.entries.length >= 100) throw new ApiError(400, "The standards list has reached its limit of 100 entries. Edit an existing entry.");
  const entry = { ...input.fields, id: input.id, updatedAt: new Date().toISOString(), updatedBy: input.editorName.slice(0, 250) };
  const next: Board = {
    version: board.version + 1,
    entries: input.create ? [...board.entries, entry] : board.entries.map(item => item.id === input.id ? entry : item),
  };
  const value = JSON.stringify(next);
  if (raw === null) {
    try {
      await prisma.systemSetting.create({ data: { key: STANDARDS_KEY, value } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw conflict();
      throw error;
    }
  } else {
    // Compare-and-swap protects simultaneous edits without a migration or a lock.
    const result = await prisma.systemSetting.updateMany({ where: { key: STANDARDS_KEY, value: raw }, data: { value } });
    if (result.count !== 1) throw conflict();
  }
  return next;
}
