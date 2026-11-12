import { describe, expect, test } from "vite-plus/test";
import { canonicalize, contentHashOf, sha256Hex } from "./hash.js";

describe("sha256", () => {
  test("matches published vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });

  test("pads correctly on every block boundary", () => {
    // A message of 55 bytes leaves exactly enough room for the 0x80 terminator
    // and the 8-byte length in one 64-byte block. An off-by-one in the padding
    // length allocates a spurious extra block here and produces a digest no
    // other SHA-256 implementation agrees with, so both sides of 55 and 119
    // bytes are pinned to published values.
    const vectors: readonly (readonly [number, string])[] = [
      [54, "a3f01b6939256127582ac8ae9fb47a382a244680806a3f613a118851c1ca1d47"],
      [55, "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318"],
      [56, "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a"],
      [63, "7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34"],
      [64, "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb"],
      [119, "31eba51c313a5c08226adf18d4a359cfdfd8d2e816b13f4af952f7ea6584dcfb"],
      [120, "2f3d335432c70b580af0e8e1b3674a7c020d683aa5f73aaaedfdc55af904c21c"],
    ];
    for (const [length, digest] of vectors) {
      expect(sha256Hex("a".repeat(length))).toBe(digest);
    }
  });

  test("hashes multi-block and non-ASCII input", () => {
    expect(sha256Hex("a".repeat(1000)).length).toBe(64);
    // Two byte sequences that differ only in a euro sign must not collide.
    expect(sha256Hex("€ 4.600")).not.toBe(sha256Hex("E 4.600"));
  });
});

describe("canonical encoding", () => {
  test("orders object keys so equal content hashes equally", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(contentHashOf({ b: 1, a: 2 })).toBe(contentHashOf({ a: 2, b: 1 }));
  });

  test("preserves array order", () => {
    expect(canonicalize([1, 2])).toBe("[1,2]");
    expect(contentHashOf([1, 2])).not.toBe(contentHashOf([2, 1]));
  });

  test("rejects non-integer numbers so currency never depends on float text", () => {
    expect(() => canonicalize({ rate: 0.1 })).toThrow(TypeError);
    expect(canonicalize({ ratePpm: 137_300 })).toBe('{"ratePpm":137300}');
  });

  test("distinguishes null from a missing key", () => {
    expect(canonicalize({ a: null })).toBe('{"a":null}');
    expect(contentHashOf({ a: null })).not.toBe(contentHashOf({}));
  });

  test("prefixes the digest with its algorithm", () => {
    expect(contentHashOf({})).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
