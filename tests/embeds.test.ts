import { describe, expect, it } from "vitest";
import { parseEmbed } from "@/lib/embeds";

describe("parseEmbed", () => {
  it("builds YouTube players from IDs, not the pasted URL", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
      "https://youtu.be/dQw4w9WgXcQ?t=42",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
    ]) {
      const embed = parseEmbed(url);
      expect(embed).toMatchObject({ type: "iframe", provider: "YouTube", media: "video" });
      expect(embed && embed.type === "iframe" && embed.src).toMatch(
        /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/,
      );
    }
  });

  it("recognizes streaming audio", () => {
    expect(parseEmbed("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc")).toMatchObject({
      provider: "Spotify", media: "audio", src: "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC",
    });
    expect(parseEmbed("https://soundcloud.com/artist/track-name")).toMatchObject({ provider: "SoundCloud", media: "audio" });
    expect(parseEmbed("https://music.apple.com/us/album/x/123?i=456")).toMatchObject({ provider: "Apple Music", height: 175 });
  });

  it("plays direct media files natively", () => {
    expect(parseEmbed("https://example.com/clip.mp4")).toMatchObject({ type: "file", media: "video" });
    expect(parseEmbed("https://example.com/song.mp3")).toMatchObject({ type: "file", media: "audio" });
  });

  it("rejects unknown hosts, look-alikes and non-http links", () => {
    expect(parseEmbed("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseEmbed("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseEmbed("javascript:alert(1)")).toBeNull();
    expect(parseEmbed("https://www.youtube.com/watch?v=short")).toBeNull();
  });
});
