export type ManualOrderNotesPayload = {
  additionalNotes: string;
  recurringDriverNotes: string;
};

export const recurringDriverNotesForCustomer = (
  recurringDriverNotes?: string | null
): string => recurringDriverNotes || "";

export const buildManualOrderNotesPayload = (
  additionalNotes: string,
  recurringDriverNotes: string
): ManualOrderNotesPayload => ({
  additionalNotes: additionalNotes.trim(),
  recurringDriverNotes: recurringDriverNotes.trim(),
});
