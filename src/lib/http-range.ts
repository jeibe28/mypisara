// HTTP byte ranges, so audio and video can be scrubbed without downloading everything first.

export type ByteRange = { start: number; end: number };

// Parses a single "bytes=start-end" range. Returns null when no range applies (serve the whole
// file) and "invalid" when the range can't be satisfied (answer 416).
export function parseRange(header: string | null, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return match ? "invalid" : null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";
  let start: number;
  let end: number;
  if (rawStart === "") {
    // "bytes=-500": the last 500 bytes.
    const length = Number(rawEnd);
    if (length <= 0) return "invalid";
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return "invalid";
  return { start, end };
}

// Keeps only bytes start..end of a stream, for when the storage layer ignores Range requests.
export function sliceStream(source: ReadableStream<Uint8Array>, start: number, end: number): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let position = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { controller.close(); return; }
        const chunkStart = position;
        const chunkEnd = position + value.length - 1;
        position += value.length;
        if (chunkEnd < start) continue;
        const from = Math.max(0, start - chunkStart);
        const to = Math.min(value.length, end - chunkStart + 1);
        if (to > from) controller.enqueue(value.subarray(from, to));
        if (chunkEnd >= end) {
          await reader.cancel().catch(() => undefined);
          controller.close();
        }
        return;
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
