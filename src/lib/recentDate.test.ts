import { describe, expect, it } from "vitest";
import { describeRecentDate } from "./recentDate";

const t = (key: string) => key;
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe("describeRecentDate", () => {
  const now = at(2026, 10, 25, 22, 30);

  it("oggi e ieri con l'ora, secondo il calendario e non le 24 ore", () => {
    expect(describeRecentDate(at(2026, 10, 25, 21, 57), now, t, "it")).toBe("home.today · 21:57");
    expect(describeRecentDate(at(2026, 10, 24, 23, 59), now, t, "it")).toBe("home.yesterday · 23:59");
    // 22:30 of today and 00:10 of the same day are both today, 23 hours earlier is yesterday
    expect(describeRecentDate(at(2026, 10, 25, 0, 10), now, t, "it")).toBe("home.today · 00:10");
    expect(describeRecentDate(at(2026, 10, 24, 22, 30), now, t, "it")).toBe("home.yesterday · 22:30");
  });

  it("prima di ieri, la data e l'ora come nel resto dell'applicazione", () => {
    expect(describeRecentDate(at(2026, 10, 23, 8, 5), now, t, "it")).toBe("2026-10-23 08:05");
    expect(describeRecentDate(at(2025, 1, 2, 3, 4), now, t, "en")).toBe("2025-01-02 03:04");
  });

  it("una data nel futuro (orologio spostato) non fa «oggi» sbagliato: è la data", () => {
    expect(describeRecentDate(at(2026, 10, 27, 9, 0), now, t, "it")).toBe("2026-10-27 09:00");
  });
});
