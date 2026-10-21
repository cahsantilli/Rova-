import { describe, expect, it } from "vitest";
import { askLimiter, limitsFromEnv } from "./limits";

describe("askLimiter", () => {
  it("caps each visitor per hour, then lets them ask again an hour later", () => {
    let t = 0;
    const take = askLimiter({ perVisitorPerHour: 2, perDay: 100 }, () => t);
    expect(take("a").ok).toBe(true);
    expect(take("a").ok).toBe(true);
    expect(take("a").ok).toBe(false);
    expect(take("b").ok).toBe(true);
    t += 60 * 60 * 1000;
    expect(take("a").ok).toBe(true);
  });

  it("caps everyone together per day and resets the next day", () => {
    let t = 0;
    const take = askLimiter({ perVisitorPerHour: 100, perDay: 2 }, () => t);
    expect(take("a").ok).toBe(true);
    expect(take("b").ok).toBe(true);
    expect(take("c")).toEqual({ ok: false, error: expect.stringMatching(/today/) });
    t += 24 * 60 * 60 * 1000;
    expect(take("c").ok).toBe(true);
  });

  it("reads limits from the environment, falling back to defaults on bad values", () => {
    expect(limitsFromEnv({})).toEqual({ perVisitorPerHour: 20, perDay: 300 });
    expect(limitsFromEnv({ ROVA_HOURLY_LIMIT: "5", ROVA_DAILY_LIMIT: "abc" })).toEqual({ perVisitorPerHour: 5, perDay: 300 });
  });
});
