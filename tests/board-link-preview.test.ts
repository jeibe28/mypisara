import { describe, expect, it } from "vitest";
import { oembedEndpoint, parseLinkPreview, previewUrl, publicPreviewAddress, fetchLinkPreview } from "../src/lib/board-link-preview";
import { boardCardSchema, newCard } from "../src/lib/boards";

describe("board link previews", () => {
  it("extracts metadata regardless of attribute order and resolves images", () => {
    const preview = parseLinkPreview(`<title>Fallback title</title><meta content="A &amp; B" property="og:title"><meta name="description" content="A useful description"><meta property="og:image" content="/image.jpg">`, "https://example.com/reference");
    expect(preview).toMatchObject({ title: "A & B", description: "A useful description", image: "https://example.com/image.jpg", site_name: "example.com" });
  });
  it("falls back to a text-only preview and rejects unsafe image schemes", () => {
    expect(parseLinkPreview('<title>Example</title><meta property="og:image" content="javascript:alert(1)">', "https://example.com")).toMatchObject({ title: "Example", image: "" });
    expect(() => previewUrl("file:///etc/passwd")).toThrow();
    expect(() => previewUrl("https://user:secret@example.com")).toThrow();
  });
  it("blocks local, reserved, mapped IPv6 and private network destinations", async () => {
    for (const ip of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.0.1", "100.64.0.1", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1"]) expect(publicPreviewAddress(ip)).toBe(false);
    expect(publicPreviewAddress("93.184.216.34")).toBe(true);
    expect(publicPreviewAddress("2606:4700:4700::1111")).toBe(true);
    await expect(fetchLinkPreview("http://127.0.0.1/secret")).rejects.toThrow("public website");
  });
  it("loads existing cards with compatible heading, preview and task defaults", () => {
    const old = { ...newCard("checklist"), tasks: [{ id: crypto.randomUUID(), text: "Task", done: false }] };
    const card = boardCardSchema.parse(old);
    expect(card.tasks[0].indent).toBe(0);
    expect(card.heading_size).toBe("large");
    expect(card.link_preview).toBeNull();
    expect(boardCardSchema.safeParse({ ...card, heading_align: "invalid" }).success).toBe(false);
  });

  it("picks a provider oEmbed endpoint for known video and music hosts only", () => {
    expect(oembedEndpoint(new URL("https://youtu.be/dQw4w9WgXcQ"))).toMatch(/^https:\/\/www\.youtube\.com\/oembed\?url=/);
    expect(oembedEndpoint(new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))).toContain("format=json");
    expect(oembedEndpoint(new URL("https://vimeo.com/76979871"))).toMatch(/^https:\/\/vimeo\.com\/api\/oembed\.json/);
    expect(oembedEndpoint(new URL("https://open.spotify.com/track/abc"))).toMatch(/^https:\/\/open\.spotify\.com\/oembed/);
    expect(oembedEndpoint(new URL("https://example.com/video"))).toBeNull();
    expect(oembedEndpoint(new URL("https://youtube.com.evil.test/watch?v=x"))).toBeNull();
  });
});
