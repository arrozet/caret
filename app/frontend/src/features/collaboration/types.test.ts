/**
 * Unit tests for collaboration type utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getUserColor,
  computePresenceStatus,
  COLLABORATOR_COLORS,
  DEFAULT_AWARENESS_CONFIG,
} from "./types";

describe("get_user_color", () => {
  it("returns a color from the predefined palette", () => {
    const color = getUserColor("user-123");
    expect(COLLABORATOR_COLORS).toContain(color);
  });

  it("returns consistent color for the same user ID", () => {
    const color1 = getUserColor("test-user");
    const color2 = getUserColor("test-user");
    expect(color1).toBe(color2);
  });

  it("returns different colors for different user IDs (most of the time)", () => {
    const colors = new Set([
      getUserColor("alice"),
      getUserColor("bob"),
      getUserColor("charlie"),
      getUserColor("david"),
      getUserColor("eve"),
    ]);
    // With 5 users and 10 colors, collision is unlikely
    expect(colors.size).toBeGreaterThan(1);
  });

  it("handles empty string", () => {
    const color = getUserColor("");
    expect(COLLABORATOR_COLORS).toContain(color);
  });
});

describe("computePresenceStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'online' for recent activity", () => {
    const now = Date.now();
    const status = computePresenceStatus(now - 1000); // 1 second ago
    expect(status).toBe("online");
  });

  it("returns 'online' for activity within timeout", () => {
    const now = Date.now();
    const status = computePresenceStatus(now - DEFAULT_AWARENESS_CONFIG.away_timeout_ms + 1000);
    expect(status).toBe("online");
  });

  it("returns 'away' for activity beyond timeout", () => {
    const now = Date.now();
    const status = computePresenceStatus(now - DEFAULT_AWARENESS_CONFIG.away_timeout_ms - 1000);
    expect(status).toBe("away");
  });

  it("respects custom config timeout", () => {
    const now = Date.now();
    const custom_config = {
      ...DEFAULT_AWARENESS_CONFIG,
      away_timeout_ms: 5000, // 5 seconds
    };

    // Activity 3 seconds ago - should be online with 5s timeout
    expect(computePresenceStatus(now - 3000, custom_config)).toBe("online");

    // Activity 10 seconds ago - should be away
    expect(computePresenceStatus(now - 10000, custom_config)).toBe("away");
  });
});
