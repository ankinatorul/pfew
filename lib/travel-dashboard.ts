import { days, type Trip, type Segment } from "./domain";
import { localToday, type Booking, type Task } from "./essentials";
import { localInstant, savedSchedule } from "./schedule";
export type DashboardEvent = {
  id: string;
  source: "booking" | "segment";
  title: string;
  day: string;
  time: string;
  timezone: string;
  status: string;
  state: "upcoming" | "underway" | "time needed";
  start: number | null;
};
export function dashboardDestination(
  trip: Trip,
  segments: Segment[],
  now = new Date(),
) {
  const candidates = segments.filter(
    (item) =>
      item.kind === "destination" &&
      item.status !== "idea" &&
      item.start_date <= localToday(item.timezone, now) &&
      item.end_date >= localToday(item.timezone, now),
  );
  const destination =
    candidates.sort(
      (a, b) =>
        b.start_date.localeCompare(a.start_date) ||
        a.position - b.position ||
        a.id.localeCompare(b.id),
    )[0] || null;
  const timezone = destination?.timezone || trip.timezone;
  const today = localToday(timezone, now);
  return {
    destination,
    timezone,
    today,
    dayNumber: days(trip.start_date, trip.end_date).indexOf(today) + 1,
  };
}
export function nextDashboardEvents(
  segments: Segment[],
  bookings: Booking[],
  now = new Date(),
) {
  const schedule = savedSchedule(segments, bookings),
    instant = now.getTime(),
    events: DashboardEvent[] = [];
  for (const source of ["booking", "segment"] as const) {
    const items =
      source === "booking"
        ? bookings
        : segments.filter(
            (item) =>
              item.status !== "idea" &&
              ["activity", "transport"].includes(item.kind),
          );
    for (const item of items) {
      if (!item.local_time) {
        if (item.start_date >= localToday(item.timezone, now))
          events.push({
            id: item.id,
            source,
            title: item.title,
            day: item.start_date,
            time: "",
            timezone: item.timezone,
            status: "verification" in item ? item.verification : item.status,
            state: "time needed",
            start: null,
          });
        continue;
      }
      let start: number;
      try {
        start = localInstant(item.start_date, item.local_time, item.timezone);
      } catch {
        if (item.start_date >= localToday(item.timezone, now))
          events.push({
            id: item.id,
            source,
            title: item.title,
            day: item.start_date,
            time: item.local_time,
            timezone: item.timezone,
            status: "verification" in item ? item.verification : item.status,
            state: "time needed",
            start: null,
          });
        continue;
      }
      const saved = schedule.records.find(
        (record) => record.source === source && record.id === item.id,
      );
      // A linked itinerary copy may have been suppressed in favor of a wallet
      // interval; use that known end rather than assuming an event lasts all day.
      const interval =
        saved ||
        schedule.records.find(
          (record) =>
            record.source === "booking" &&
            record.linkedId === item.id &&
            record.start === start,
        );
      const underway = start <= instant && !!interval && interval.end > instant;
      if (start < instant && !underway) continue;
      events.push({
        id: item.id,
        source,
        title: item.title,
        day: item.start_date,
        time: item.local_time,
        timezone: item.timezone,
        status: "verification" in item ? item.verification : item.status,
        state: underway ? "underway" : "upcoming",
        start,
      });
    }
  }
  const ranked = events.sort((a, b) => {
    const rank = (event: DashboardEvent) =>
      event.state === "underway" ? 0 : event.start !== null ? 1 : 2;
    return (
      rank(a) - rank(b) ||
      (a.start !== null && b.start !== null
        ? a.start - b.start
        : a.day.localeCompare(b.day)) ||
      a.source.localeCompare(b.source) ||
      a.id.localeCompare(b.id)
    );
  });
  return ranked.filter(
    (event) =>
      event.source !== "segment" ||
      !bookings.some(
        (booking) =>
          booking.segment_id === event.id &&
          ranked.some(
            (other) =>
              other.source === "booking" &&
              other.id === booking.id &&
              ((other.start !== null &&
                event.start !== null &&
                other.start === event.start) ||
                (other.start === null &&
                  event.start === null &&
                  other.day === event.day &&
                  other.time === event.time &&
                  other.timezone === event.timezone)),
          ),
      ),
  );
}
export function dashboardTaskWindow(
  tasks: Task[],
  timezone: string,
  now = new Date(),
) {
  const today = localToday(timezone, now),
    calendar = new Date(today + "T12:00:00Z");
  calendar.setUTCDate(calendar.getUTCDate() + 7);
  const horizon = calendar.toISOString().slice(0, 10);
  const open = tasks.filter((task) => !task.done),
    due = open
      .filter((task) => task.due_date && task.due_date <= horizon)
      .sort(
        (a, b) =>
          String(a.due_date).localeCompare(String(b.due_date)) ||
          a.title.localeCompare(b.title),
      );
  return {
    total: tasks.length,
    completed: tasks.length - open.length,
    open: open.length,
    overdue: due.filter((task) => String(task.due_date) < today).length,
    due,
    today,
    horizon,
  };
}
