import { getDb } from "./db";
import { performAction } from "./banking";
import type { Staff } from "./types";
import { HttpError } from "./http";

/** Run the bank's background jobs through the same services as the staff UI. */
export async function runMaintenance(user: Staff) {
  if (!["admin", "higher_manager"].includes(user.role)) {
    throw new HttpError(403, "Organization maintenance requires an administrator or higher manager.");
  }
  const messages: string[] = [];
  messages.push((await performAction(user, { action: "interest.accrue" })).message);

  // Catch up completed months if the classroom app has been offline.
  // Each service is independently transactional and safely ignores paid credits.
  const { rows } = await (await getDb()).query<{ period: string }>(`
    SELECT to_char(month_start, 'YYYY-MM') AS period
    FROM generate_series(
      (SELECT date_trunc('month',min(opened_at) AT TIME ZONE 'Asia/Colombo') FROM savings_accounts),
      date_trunc('month',now() AT TIME ZONE 'Asia/Colombo')-interval '1 month',
      interval '1 month'
    ) month_start ORDER BY month_start
  `);
  for (const { period } of rows) {
    messages.push((await performAction(user, { action: "interest.run", period })).message);
  }
  messages.push((await performAction(user, { action: "fd.processMaturities" })).message);
  messages.push((await performAction(user, { action: "account.processInactivity" })).message);
  return { message: "Maintenance completed.", details: messages };
}
