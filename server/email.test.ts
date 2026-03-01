import { describe, it, expect, vi } from "vitest";

// Test the email module can be imported and the send helper gracefully handles missing key
describe("Email helper", () => {
  it("should export all email send functions", async () => {
    const emailModule = await import("./email");
    expect(typeof emailModule.sendWelcomeEmail).toBe("function");
    expect(typeof emailModule.sendPasswordResetEmail).toBe("function");
    expect(typeof emailModule.sendJobAssignedEmail).toBe("function");
    expect(typeof emailModule.sendJobSubmittedEmail).toBe("function");
    expect(typeof emailModule.sendJobPaidEmail).toBe("function");
    expect(typeof emailModule.sendNewCommentEmail).toBe("function");
    expect(typeof emailModule.sendJobDisputedEmail).toBe("function");
    expect(typeof emailModule.sendDisputeResubmittedEmail).toBe("function");
  });

  it("should return false gracefully when RESEND_API_KEY is empty", async () => {
    // Temporarily override env to simulate missing key
    const { ENV } = await import("./_core/env");
    const originalKey = ENV.resendApiKey;
    (ENV as any).resendApiKey = "";

    const { sendWelcomeEmail } = await import("./email");
    const result = await sendWelcomeEmail({
      to: "test@example.com",
      name: "Test User",
      role: "contractor",
    });
    expect(result).toBe(false);

    (ENV as any).resendApiKey = originalKey;
  });
});
