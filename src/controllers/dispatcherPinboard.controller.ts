import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ApiError } from "../utils/ApiError";

const createSchema = z.object({
  id: z.uuid(), title: z.string().trim().min(1).max(140),
  message: z.string().trim().min(1).max(3000), isImportant: z.boolean(),
}).strict();
const statusSchema = z.object({ status: z.enum(["ACTIVE", "RESOLVED"]), version: z.number().int().nonnegative() }).strict();
const pageSchema = z.object({ status: z.enum(["ACTIVE", "RESOLVED"]).default("ACTIVE"), page: z.coerce.number().int().min(1).max(100000).default(1) });
const identitySelect = { firstName: true, lastName: true } as const;
const noteInclude = {
  author: { select: identitySelect }, resolvedBy: { select: identitySelect },
  reads: { select: { userId: true, readAt: true, user: { select: identitySelect } }, orderBy: { readAt: "asc" as const } },
} satisfies Prisma.DispatcherNoteInclude;
type Note = Prisma.DispatcherNoteGetPayload<{ include: typeof noteInclude }>;
const actor = (req: Request) => (req as Request & { user: { userId: string } }).user.userId;
const idOf = (req: Request) => z.uuid().parse(req.params.id);
const present = (note: Note, userId: string) => ({
  id: note.id, title: note.title, message: note.message, isImportant: note.isImportant,
  status: note.status, version: note.version, createdAt: note.createdAt,
  author: note.author, resolvedAt: note.resolvedAt, resolvedBy: note.resolvedBy,
  hasRead: note.reads.some(read => read.userId === userId),
  readBy: note.reads.map(read => ({ name: read.user, readAt: read.readAt })),
});

export const pinboardSummary = async (req: Request, res: Response) => {
  const unreadTotal = await prisma.dispatcherNote.count({ where: { status: "ACTIVE", reads: { none: { userId: actor(req) } } } });
  res.json({ unreadTotal });
};

export const listPinboardNotes = async (req: Request, res: Response) => {
  const { status, page } = pageSchema.parse(req.query);
  const pageSize = 20;
  const [notes, total] = await Promise.all([
    prisma.dispatcherNote.findMany({ where: { status }, include: noteInclude,
      orderBy: [{ isImportant: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.dispatcherNote.count({ where: { status } }),
  ]);
  res.json({ notes: notes.map(note => present(note, actor(req))), total, pageSize, page, status });
};

export const createPinboardNote = async (req: Request, res: Response) => {
  const data = createSchema.parse(req.body);
  const authorId = actor(req);
  try {
    const note = await prisma.dispatcherNote.create({
      data: { ...data, authorId, reads: { create: { userId: authorId } } }, include: noteInclude,
    });
    res.status(201).json({ note: present(note, authorId) });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    // Retrying a post after an interrupted connection must not create a second note.
    const existing = await prisma.dispatcherNote.findUnique({ where: { id: data.id }, include: noteInclude });
    if (!existing || existing.authorId !== authorId || existing.title !== data.title || existing.message !== data.message || existing.isImportant !== data.isImportant) {
      throw new ApiError(409, "This note may already have been posted. Refresh the board and check before starting a new note.");
    }
    res.json({ note: present(existing, authorId) });
  }
};

export const readPinboardNote = async (req: Request, res: Response) => {
  const noteId = idOf(req);
  z.object({}).strict().parse(req.body);
  const note = await prisma.dispatcherNote.findUnique({ where: { id: noteId }, select: { id: true } });
  if (!note) throw new ApiError(404, "Note not found. Refresh the board.");
  await prisma.dispatcherNoteRead.upsert({
    where: { noteId_userId: { noteId, userId: actor(req) } }, update: {}, create: { noteId, userId: actor(req) },
  });
  res.json({ message: "Marked as read." });
};

export const setPinboardNoteStatus = async (req: Request, res: Response) => {
  const id = idOf(req);
  const { status, version } = statusSchema.parse(req.body);
  const result = await prisma.dispatcherNote.updateMany({
    where: { id, version, status: status === "ACTIVE" ? "RESOLVED" : "ACTIVE" },
    data: { status, version: { increment: 1 }, resolvedAt: status === "RESOLVED" ? new Date() : null,
      resolvedById: status === "RESOLVED" ? actor(req) : null },
  });
  const note = await prisma.dispatcherNote.findUnique({ where: { id }, include: noteInclude });
  if (!note) throw new ApiError(404, "Note not found. Refresh the board.");
  if (result.count === 0 && note.status !== status) throw new ApiError(409, "Someone changed this note. Refresh the board before trying again.");
  res.json({ note: present(note, actor(req)) });
};
