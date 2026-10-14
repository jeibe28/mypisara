import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Parser } from "htmlparser2";

export function publicPreviewAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
  }
  // Only global unicast IPv6; exclude transition and documentation ranges.
  const [first, second] = address.split(":").map((part) => parseInt(part || "0", 16));
  return isIP(address) === 6 && first >= 0x2000 && first <= 0x3fff && first !== 0x2002 &&
    !(first === 0x2001 && (second < 0x200 || second === 0xdb8));
}

export function previewUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    (url.port && !["80", "443"].includes(url.port)) || value.length > 2048)
    throw new Error("Use a public http or https URL.");
  return url;
}

export function parseLinkPreview(html: string, source: string) {
  const values: Record<string, string> = {};
  let inTitle = false;
  let title = "";
  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === "title") inTitle = true;
      if (name === "meta") {
        const key = (attrs.property || attrs.name || "").toLowerCase();
        if (attrs.content && !values[key]) values[key] = attrs.content;
      }
    },
    ontext(value) { if (inTitle) title += value; },
    onclosetag(name) { if (name === "title") inTitle = false; },
  }, { decodeEntities: true });
  parser.write(html);
  parser.end();
  const clean = (value: string, length: number) => value.replace(/\s+/g, " ").trim().slice(0, length);
  let image = "";
  try { image = previewUrl(new URL(values["og:image"] || values["twitter:image"] || "", source).href).href; }
  catch { /* A text-only preview is still useful. */ }
  if (!values["og:image"] && !values["twitter:image"]) image = "";
  return {
    url: source,
    title: clean(values["og:title"] || values["twitter:title"] || title, 200),
    description: clean(values["og:description"] || values["twitter:description"] || values.description || "", 1000),
    image,
    site_name: clean(values["og:site_name"] || new URL(source).hostname.replace(/^www\./, ""), 200),
  };
}

// Video and music hosts publish a small JSON "oEmbed" record with the real title and thumbnail.
// It is far more reliable than scraping their pages, which often sit behind consent walls.
const OEMBED_HOSTS: { hosts: string[]; endpoint: string }[] = [
  { hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"], endpoint: "https://www.youtube.com/oembed" },
  { hosts: ["vimeo.com"], endpoint: "https://vimeo.com/api/oembed.json" },
  { hosts: ["open.spotify.com", "spotify.com"], endpoint: "https://open.spotify.com/oembed" },
  { hosts: ["soundcloud.com"], endpoint: "https://soundcloud.com/oembed" },
  { hosts: ["dailymotion.com", "dai.ly"], endpoint: "https://www.dailymotion.com/services/oembed" },
];

export function oembedEndpoint(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^(www|m|music|open|player)\./, "");
  const match = OEMBED_HOSTS.find(({ hosts }) => hosts.some((item) => host === item.replace(/^open\./, "")));
  if (!match) return null;
  const query = new URLSearchParams({ url: url.href, format: "json" });
  return `${match.endpoint}?${query}`;
}

export async function fetchOembed(url: URL, source: string) {
  const endpoint = oembedEndpoint(url);
  if (!endpoint) return null;
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const data = await response.json();
  if (typeof data?.title !== "string" || !data.title.trim()) return null;
  let image = "";
  try { image = typeof data.thumbnail_url === "string" ? previewUrl(data.thumbnail_url).href : ""; } catch { /* Title alone is enough. */ }
  const clean = (value: unknown, length: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, length) : "";
  return {
    url: source,
    title: clean(data.title, 200),
    description: "",
    image,
    site_name: clean(data.provider_name, 200) || url.hostname.replace(/^www\./, ""),
  };
}

export async function fetchLinkPreview(value: string) {
  let url = previewUrl(value);
  const embedded = await fetchOembed(url, value).catch(() => null);
  if (embedded) return embedded;
  const deadline = Date.now() + 8000;
  for (let redirects = 0; redirects <= 3; redirects++) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] :
      await Promise.race([
        lookup(hostname, { all: true }),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error("Preview timed out.")), Math.max(1, deadline - Date.now()));
          timer.unref();
        }),
      ]);
    if (!addresses.length || addresses.some(({ address }) => !publicPreviewAddress(address)))
      throw new Error("Use a public website URL.");
    const target = addresses[0];
    const result = await new Promise<{ html?: string; redirect?: string }>((resolve, reject) => {
      const req = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        family: target.family,
        headers: { "User-Agent": "EditDesk-LinkPreview/1.0", Accept: "text/html" },
        // Pin the connection to the address we validated, preventing DNS rebinding.
        lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
      }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve({ redirect: res.headers.location }); res.destroy(); return;
        }
        if (!res.statusCode || res.statusCode >= 400 || !/text\/html|application\/xhtml\+xml/i.test(res.headers["content-type"] || "")) {
          reject(new Error("This page does not provide a preview.")); res.destroy(); return;
        }
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 1_000_000) {
            reject(new Error("This page is too large to preview.")); req.destroy(); return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ html: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", reject);
      });
      const timer = setTimeout(() => req.destroy(new Error("Preview timed out.")), Math.max(1, deadline - Date.now()));
      req.on("close", () => clearTimeout(timer));
      req.on("error", reject);
      req.end();
    });
    if (result.redirect) { url = previewUrl(new URL(result.redirect, url).href); continue; }
    const preview = parseLinkPreview(result.html || "", url.href);
    return { ...preview, url: value };
  }
  throw new Error("Too many redirects to load this preview.");
}
