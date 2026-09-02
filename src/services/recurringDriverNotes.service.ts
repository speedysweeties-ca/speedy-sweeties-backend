export const RECURRING_DRIVER_NOTES_MAX_LENGTH = 1000;

type RecurringDriverNotesInput = {
  isManualOrder: boolean;
  submitted: boolean;
  submittedValue: unknown;
  storedValue: string | null | undefined;
};

export type RecurringDriverNotesPlan = {
  snapshot: string | null;
  customerUpdate: string | null | undefined;
};

type CustomerRecurringDriverNotesWriter = {
  customer: {
    update: (args: {
      where: { id: string };
      data: { recurringDriverNotes: string | null };
    }) => Promise<unknown>;
  };
};

const cleanNote = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed || null;
};

export const resolveRecurringDriverNotes = ({
  isManualOrder,
  submitted,
  submittedValue,
  storedValue
}: RecurringDriverNotesInput): RecurringDriverNotesPlan => {
  if (!isManualOrder) {
    return {
      snapshot: null,
      customerUpdate: undefined
    };
  }

  if (submitted) {
    const cleanedSubmittedValue = cleanNote(submittedValue);

    return {
      snapshot: cleanedSubmittedValue,
      customerUpdate: cleanedSubmittedValue
    };
  }

  return {
    snapshot: cleanNote(storedValue),
    customerUpdate: undefined
  };
};

export const combineOrderNotes = (
  values: ReadonlyArray<unknown>,
  deduplicate = false
): string | null => {
  const notes = values
    .map(cleanNote)
    .filter((value): value is string => value !== null);
  const combinedNotes = deduplicate ? Array.from(new Set(notes)) : notes;

  return combinedNotes.length > 0 ? combinedNotes.join(" | ") : null;
};

export const persistSubmittedRecurringDriverNotes = async (
  writer: CustomerRecurringDriverNotesWriter,
  customerId: string,
  customerUpdate: string | null | undefined
): Promise<void> => {
  if (customerUpdate === undefined) return;

  await writer.customer.update({
    where: { id: customerId },
    data: { recurringDriverNotes: customerUpdate }
  });
};
