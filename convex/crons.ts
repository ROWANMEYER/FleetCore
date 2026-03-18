import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("pdp-stage-reminders", { hourUTC: 5, minuteUTC: 0 }, internal.notifications.checkStageReminders);

crons.monthly("pdp-expiry-reminders", { day: 1, hourUTC: 5, minuteUTC: 0 }, internal.notifications.checkExpiryReminders);

export default crons;

