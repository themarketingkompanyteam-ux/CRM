export const CALL_OUTCOMES = [
  "No Answer",
  "Voicemail",
  "Call Back Later",
  "Interested",
  "Booked Call",
  "Not Interested",
  "Wrong Number",
  "Requested Information",
  "Other",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export const LEAD_TEMPERATURES = ["Cold", "Warm", "Hot"] as const;

/** What each outcome implies for the contact's lead status, absent an explicit override. */
export const OUTCOME_DEFAULT_TEMPERATURE: Partial<Record<CallOutcome, string>> = {
  Interested: "Warm",
  "Booked Call": "Hot",
  "Requested Information": "Warm",
  "Not Interested": "Cold",
  "Wrong Number": "Cold",
};

/** Follow-up task title + due-date offset (hours) generated per outcome, if any. */
export function followUpForOutcome(
  outcome: CallOutcome,
  contactName: string,
  callbackAt: Date | null
): { title: string; dueAt: Date } | null {
  const now = Date.now();
  switch (outcome) {
    case "Voicemail":
    case "No Answer":
      return { title: `Follow up with ${contactName}`, dueAt: new Date(now + 2 * 24 * 3600 * 1000) };
    case "Call Back Later":
      return {
        title: `Call back ${contactName}`,
        dueAt: callbackAt ?? new Date(now + 24 * 3600 * 1000),
      };
    case "Interested":
      return { title: `Send follow-up to ${contactName}`, dueAt: new Date(now + 24 * 3600 * 1000) };
    case "Booked Call":
      return { title: `Prepare for meeting with ${contactName}`, dueAt: callbackAt ?? new Date(now + 24 * 3600 * 1000) };
    case "Requested Information":
      return { title: `Send requested info to ${contactName}`, dueAt: new Date(now + 4 * 3600 * 1000) };
    default:
      return null;
  }
}
