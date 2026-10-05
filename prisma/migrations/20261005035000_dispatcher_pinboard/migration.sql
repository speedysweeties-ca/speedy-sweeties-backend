CREATE TYPE "DispatcherNoteStatus" AS ENUM ('ACTIVE', 'RESOLVED');

CREATE TABLE "DispatcherNote" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "message" VARCHAR(3000) NOT NULL,
    "isImportant" BOOLEAN NOT NULL DEFAULT false,
    "status" "DispatcherNoteStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    CONSTRAINT "DispatcherNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DispatcherNoteRead" (
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DispatcherNoteRead_pkey" PRIMARY KEY ("noteId", "userId")
);

CREATE INDEX "DispatcherNote_status_isImportant_createdAt_idx" ON "DispatcherNote"("status", "isImportant", "createdAt");
CREATE INDEX "DispatcherNoteRead_userId_idx" ON "DispatcherNoteRead"("userId");
ALTER TABLE "DispatcherNote" ADD CONSTRAINT "DispatcherNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DispatcherNote" ADD CONSTRAINT "DispatcherNote_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DispatcherNoteRead" ADD CONSTRAINT "DispatcherNoteRead_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DispatcherNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DispatcherNoteRead" ADD CONSTRAINT "DispatcherNoteRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
