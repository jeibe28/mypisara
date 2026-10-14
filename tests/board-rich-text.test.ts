import { describe, expect, it } from "vitest";
import { sanitizeBoardRichText } from "../src/lib/boards";

describe("note rich text", () => {
  it("keeps bold and italic written as <b> and <i> by the browser", () => {
    expect(sanitizeBoardRichText("<b>Bold</b> and <i>italic</i>")).toBe("<strong>Bold</strong> and <em>italic</em>");
  });

  it("keeps each editor line as its own paragraph", () => {
    expect(sanitizeBoardRichText("first<div>second</div><div>third</div>")).toBe("first<p>second</p><p>third</p>");
  });

  it("allows the small-text block and still strips unsafe markup", () => {
    expect(sanitizeBoardRichText("<h6>Fine print</h6>")).toBe("<h6>Fine print</h6>");
    expect(sanitizeBoardRichText('<h6 onclick="x()">Hi</h6><script>alert(1)</script>')).toBe("<h6>Hi</h6>");
    expect(sanitizeBoardRichText('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
  });
});
