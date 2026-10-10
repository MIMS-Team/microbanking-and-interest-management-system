import { performAction } from "./banking";
import type { Staff } from "./types";
import { HttpError } from "./http";

/** Run the bank's background jobs through the same services as the staff UI. */
export async function runMaintenance(user: Staff) {
  if (!["admin", "higher_manager"].includes(user.role)) {
    throw new HttpError(403, "Organization maintenance requires an administrator or higher manager.");
  }
  const messages: string[] = [];
  messages.push((await performAction(user, { action: "fd.processMaturities" })).message);
  messages.push((await performAction(user, { action: "account.processInactivity" })).message);
  return { message: "Maintenance completed.", details: messages };
}
