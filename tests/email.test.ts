import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { emailAvailable, emailConfigured, emailTemplate, sendEmail } from "@/lib/email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("email", () => {
  it("escapes user-controlled text in the HTML body", () => {
    const { html, text } = emailTemplate({
      heading: "Hi <b>",
      body: "Change to a&b@example.com",
      action: "Go",
      url: "https://example.com/?a=1&b=\"2\"",
    });
    expect(html).not.toContain("<b>");
    expect(html).toContain("&#60;b&#62;");
    expect(html).toContain("a&#38;b@example.com");
    expect(text).toContain("https://example.com/?a=1&b=\"2\"");
  });

  it("is only available in production when a provider is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    expect(emailConfigured()).toBe(false);
    expect(emailAvailable()).toBe(false);
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "MyPisara <hello@example.com>");
    expect(emailAvailable()).toBe(true);
  });

  it("sends through the provider and reports rejections", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "MyPisara <hello@example.com>");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    await sendEmail({ to: "a@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toMatchObject({ to: "a@example.com", subject: "Hi" });

    fetchMock.mockResolvedValue({ ok: false, status: 422 });
    await expect(
      sendEmail({ to: "a@example.com", subject: "Hi", html: "", text: "" }),
    ).rejects.toThrow(/rejected/);
  });

  it("refuses to fall back to the console in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM", "");
    await expect(
      sendEmail({ to: "a@example.com", subject: "Hi", html: "", text: "" }),
    ).rejects.toThrow(/not configured/);
  });
});
