import assert from "node:assert/strict";
import test from "node:test";

import { imageSize } from "image-size";
import { HEIF } from "image-size/types/heif";
import { ICNS } from "image-size/types/icns";
import { JXL } from "image-size/types/jxl";

function writeBox(view, offset, size, name) {
  view.setUint32(offset, size, false);
  new TextEncoder().encodeInto(name, new Uint8Array(view.buffer, offset + 4, 4));
}

test("patched image-size rejects zero-length ICNS entries", () => {
  const bytes = new Uint8Array(16);
  bytes.set(new TextEncoder().encode("icns"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, bytes.length, false);
  bytes.set(new TextEncoder().encode("ic07"), 8);
  view.setUint32(12, 0, false);

  assert.throws(() => ICNS.calculate(bytes), /Invalid ICNS entry length/);
  assert.throws(() => imageSize(bytes), /Invalid ICNS entry length/);
});

test("patched image-size rejects non-advancing JXL partial streams", () => {
  const bytes = new Uint8Array(16);
  writeBox(new DataView(bytes.buffer), 0, 0, "jxlp");

  assert.throws(() => JXL.calculate(bytes), /Invalid JXL partial stream length/);
});

test("patched image-size rejects non-advancing HEIF properties", () => {
  const bytes = new Uint8Array(52);
  const view = new DataView(bytes.buffer);
  writeBox(view, 0, 52, "meta");
  writeBox(view, 12, 40, "iprp");
  writeBox(view, 20, 32, "ipco");
  writeBox(view, 28, 0, "ispe");

  assert.throws(() => HEIF.calculate(bytes), /Invalid HEIF image property length/);
});
