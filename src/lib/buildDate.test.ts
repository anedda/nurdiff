import { describe, expect, it } from "vitest";
import { formatBuildDate } from "./buildDate";

describe("formatBuildDate", () => {
  it("scrive giorno, mese per esteso, anno e ora", () => {
    expect(formatBuildDate("2026-10-17T08:07:00.000Z", "it", "Europe/Rome")).toBe("17 ottobre 2026, 10:07");
    expect(formatBuildDate("2026-01-05T23:30:00.000Z", "it", "UTC")).toBe("5 gennaio 2026, 23:30");
  });
  it("una data mancante o illeggibile dà una stringa vuota", () => {
    expect(formatBuildDate("")).toBe("");
    expect(formatBuildDate("non è una data")).toBe("");
  });
});
