import { describe, expect, it } from "vitest";
import { parseRange, sliceStream } from "../src/lib/http-range";

async function readAll(stream: ReadableStream<Uint8Array>) {
  const out: number[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.push(...value);
  }
  return out;
}
const source = (chunks: number[][]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
      controller.close();
    },
  });

describe("byte ranges", () => {
  it("parses open, closed and suffix ranges", () => {
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=50-", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99 });
  });

  it("rejects ranges that can't be served and ignores other units", () => {
    expect(parseRange("bytes=100-120", 100)).toBe("invalid");
    expect(parseRange("bytes=20-10", 100)).toBe("invalid");
    expect(parseRange("bytes=-", 100)).toBe("invalid");
    expect(parseRange("items=0-1", 100)).toBeNull();
  });

  it("cuts a stream down to the requested bytes across chunk boundaries", async () => {
    const data = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9]];
    expect(await readAll(sliceStream(source(data), 0, 9))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(await readAll(sliceStream(source(data), 2, 6))).toEqual([2, 3, 4, 5, 6]);
    expect(await readAll(sliceStream(source(data), 7, 9))).toEqual([7, 8, 9]);
    expect(await readAll(sliceStream(source(data), 4, 4))).toEqual([4]);
  });
});
