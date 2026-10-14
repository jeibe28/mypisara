// Turns a pasted video or audio link into something safe to play inside a card.
// Players are only ever built from IDs parsed out of known hosts, never from the
// raw pasted URL, so a card can't be pointed at an arbitrary page.

export type EmbedSource =
  | {
      type: "iframe";
      provider: string;
      media: "video" | "audio";
      src: string;
      autoplaySrc?: string;
      thumbnail?: string;
      aspect?: string; // CSS aspect-ratio, for video players
      height?: number; // fixed height, for audio players
    }
  | { type: "file"; provider: "Direct file"; media: "video" | "audio"; src: string };

const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogv)$/i;
const AUDIO_FILE = /\.(mp3|m4a|wav|ogg|oga|aac|flac|opus)$/i;

export function parseEmbed(input: string, parentHost = ""): EmbedSource | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music|open|player)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  const q = (key: string) => url.searchParams.get(key) ?? "";
  const id = (value: string | undefined, pattern: RegExp) => (value && pattern.test(value) ? value : "");

  // YouTube
  if (host === "youtu.be" || host === "youtube.com" || host === "youtube-nocookie.com") {
    const video = id(
      host === "youtu.be"
        ? parts[0]
        : ["shorts", "embed", "live", "v"].includes(parts[0])
          ? parts[1]
          : q("v"),
      /^[\w-]{11}$/,
    );
    const list = id(q("list"), /^[\w-]{10,64}$/);
    const start = Number(q("t").replace(/s$/, "")) || Number(q("start")) || 0;
    const base = "https://www.youtube-nocookie.com/embed/";
    if (video) {
      const params = `rel=0${start > 0 ? `&start=${Math.floor(start)}` : ""}${list ? `&list=${list}` : ""}`;
      return {
        type: "iframe", provider: "YouTube", media: "video",
        src: `${base}${video}?${params}`,
        autoplaySrc: `${base}${video}?${params}&autoplay=1`,
        thumbnail: `https://i.ytimg.com/vi/${video}/hqdefault.jpg`,
        aspect: "16 / 9",
      };
    }
    if (list)
      return {
        type: "iframe", provider: "YouTube", media: "video",
        src: `${base}videoseries?list=${list}`,
        autoplaySrc: `${base}videoseries?list=${list}&autoplay=1`,
        aspect: "16 / 9",
      };
    return null;
  }

  // Vimeo
  if (host === "vimeo.com") {
    const video = parts.find((part) => /^\d{5,}$/.test(part));
    const hash = id(parts[parts.indexOf(video ?? "") + 1], /^[a-f0-9]{6,}$/i) || id(q("h"), /^[a-f0-9]{6,}$/i);
    if (!video) return null;
    const src = `https://player.vimeo.com/video/${video}${hash ? `?h=${hash}` : ""}`;
    return {
      type: "iframe", provider: "Vimeo", media: "video", src,
      autoplaySrc: `${src}${hash ? "&" : "?"}autoplay=1`, aspect: "16 / 9",
    };
  }

  // Dailymotion
  if (host === "dailymotion.com" || host === "dai.ly") {
    const video = id(host === "dai.ly" ? parts[0] : parts[parts.indexOf("video") + 1], /^[a-z0-9]{5,12}$/i);
    if (!video) return null;
    const src = `https://www.dailymotion.com/embed/video/${video}`;
    return { type: "iframe", provider: "Dailymotion", media: "video", src, autoplaySrc: `${src}?autoplay=1`, aspect: "16 / 9" };
  }

  // Loom
  if (host === "loom.com") {
    const video = id(parts[parts.findIndex((part) => part === "share" || part === "embed") + 1], /^[a-f0-9]{32}$/i);
    if (!video) return null;
    const src = `https://www.loom.com/embed/${video}`;
    return { type: "iframe", provider: "Loom", media: "video", src, autoplaySrc: `${src}?autoplay=1`, aspect: "16 / 9" };
  }

  // Twitch (the player requires the embedding site's hostname)
  if (host === "twitch.tv" && parentHost) {
    const parent = `&parent=${encodeURIComponent(parentHost)}`;
    const video = parts[0] === "videos" ? id(parts[1], /^\d+$/) : "";
    const channel = !video ? id(parts[0], /^\w{3,25}$/) : "";
    if (!video && !channel) return null;
    const src = `https://player.twitch.tv/?${video ? `video=${video}` : `channel=${channel}`}${parent}`;
    return { type: "iframe", provider: "Twitch", media: "video", src, autoplaySrc: `${src}&autoplay=true`, aspect: "16 / 9" };
  }

  // Spotify
  if (host === "spotify.com") {
    const at = parts.findIndex((part) => ["track", "album", "playlist", "episode", "show", "artist"].includes(part));
    const kind = parts[at];
    const item = id(parts[at + 1], /^[A-Za-z0-9]{22}$/);
    if (at < 0 || !item) return null;
    return {
      type: "iframe", provider: "Spotify", media: "audio",
      src: `https://open.spotify.com/embed/${kind}/${item}`,
      height: kind === "track" || kind === "episode" ? 152 : 352,
    };
  }

  // SoundCloud
  if (host === "soundcloud.com" && parts.length >= 1 && !["discover", "stream", "you", "search"].includes(parts[0])) {
    const page = `https://soundcloud.com/${parts.map(encodeURIComponent).join("/")}`;
    return {
      type: "iframe", provider: "SoundCloud", media: "audio",
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(page)}&visual=false&show_comments=false`,
      height: parts[1] === "sets" || parts.length === 1 ? 300 : 166,
    };
  }

  // Apple Music
  if (host === "music.apple.com" || url.hostname.toLowerCase() === "music.apple.com") {
    if (!parts.length) return null;
    return {
      type: "iframe", provider: "Apple Music", media: "audio",
      src: `https://embed.music.apple.com${url.pathname}${url.search}`,
      height: q("i") ? 175 : 450,
    };
  }

  // Deezer
  if (host === "deezer.com") {
    const at = parts.findIndex((part) => ["track", "album", "playlist", "episode", "show"].includes(part));
    const item = id(parts[at + 1], /^\d+$/);
    if (at < 0 || !item) return null;
    return {
      type: "iframe", provider: "Deezer", media: "audio",
      src: `https://widget.deezer.com/widget/auto/${parts[at]}/${item}`,
      height: parts[at] === "track" || parts[at] === "episode" ? 150 : 300,
    };
  }

  // Mixcloud
  if (host === "mixcloud.com" && parts.length >= 2) {
    const feed = `/${parts.map(encodeURIComponent).join("/")}/`;
    return {
      type: "iframe", provider: "Mixcloud", media: "audio",
      src: `https://player-widget.mixcloud.com/widget/iframe/?feed=${encodeURIComponent(feed)}&hide_cover=1`,
      height: 120,
    };
  }

  // A direct link to a media file plays natively.
  if (VIDEO_FILE.test(url.pathname)) return { type: "file", provider: "Direct file", media: "video", src: url.href };
  if (AUDIO_FILE.test(url.pathname)) return { type: "file", provider: "Direct file", media: "audio", src: url.href };
  return null;
}

export const EMBED_PROVIDERS = {
  video: "YouTube, Vimeo, Dailymotion, Loom, Twitch, or a direct .mp4/.webm link",
  audio: "Spotify, SoundCloud, Apple Music, Deezer, Mixcloud, or a direct .mp3/.m4a link",
};
