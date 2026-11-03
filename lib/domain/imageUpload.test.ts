import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IMAGE_BUCKET,
  MAX_IMAGE_BYTES,
  imageObjectPath,
  imageVersion,
  optionalImageFile,
  storagePathFromPublicUrl,
  storagePathsForUrls,
  validateImageFile,
} from "./imageUpload.ts";

const BASE = "https://abc.supabase.co/storage/v1/object/public";

describe("validateImageFile", () => {
  it("maps allowed mime types to an extension", () => {
    assert.deepEqual(validateImageFile({ type: "image/png", size: 10 }), { ok: true, ext: "png" });
    assert.deepEqual(validateImageFile({ type: "image/jpeg", size: 10 }), { ok: true, ext: "jpg" });
    assert.deepEqual(validateImageFile({ type: "image/webp", size: 10 }), { ok: true, ext: "webp" });
  });
  it("rejects empty files", () => {
    const res = validateImageFile({ type: "image/png", size: 0 });
    assert.equal(res.ok, false);
  });
  it("rejects unsupported types", () => {
    const res = validateImageFile({ type: "image/gif", size: 10 });
    assert.deepEqual(res, { ok: false, error: "Formato no soportado — usa PNG, JPG o WEBP." });
  });
  it("rejects files over 5 MB but accepts exactly 5 MB", () => {
    assert.equal(validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES }).ok, true);
    assert.deepEqual(validateImageFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 }), {
      ok: false,
      error: "La imagen supera 5 MB.",
    });
  });
});

describe("imageVersion", () => {
  it("is a short lowercase base36 token", () => {
    const v = imageVersion(1_762_200_000_000, () => 0.5);
    assert.match(v, /^[0-9a-z]{13}$/);
  });
  it("sorts by time", () => {
    const earlier = imageVersion(1_762_200_000_000, () => 0.99);
    const later = imageVersion(1_762_200_000_001, () => 0);
    assert.ok(earlier < later);
  });
  it("differs for two uploads in the same millisecond", () => {
    assert.notEqual(imageVersion(1_762_200_000_000, () => 0.1), imageVersion(1_762_200_000_000, () => 0.2));
  });
});

describe("imageObjectPath", () => {
  it("builds folder/sku-version.ext: every upload is a new, immutable object", () => {
    assert.equal(imageObjectPath("variants", "CRI-001-A", "jpg", "mhk2x9z0abcd"), "variants/CRI-001-A-mhk2x9z0abcd.jpg");
    assert.equal(imageObjectPath("stock-items", "CM0148", "webp", "0001"), "stock-items/CM0148-0001.webp");
  });
  it("rejects skus that could escape the folder", () => {
    assert.equal(imageObjectPath("variants", "../x", "jpg", "v1"), null);
    assert.equal(imageObjectPath("variants", "a/b", "jpg", "v1"), null);
    assert.equal(imageObjectPath("variants", "", "jpg", "v1"), null);
  });
  it("rejects a version that is not a plain token", () => {
    for (const version of ["", "../x", "a/b", "A B", "v.1"]) {
      assert.equal(imageObjectPath("variants", "CRI-1", "jpg", version), null, version);
    }
  });
});

describe("storagePathFromPublicUrl with legacy and versioned paths", () => {
  it("recognizes both the legacy sku.ext and the versioned sku-version.ext", () => {
    assert.equal(
      storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/variants/CRI-1-V01.webp`, "variants"),
      "variants/CRI-1-V01.webp",
    );
    assert.equal(
      storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/variants/CRI-1-V01-mhk2x9z0abcd.webp`, "variants"),
      "variants/CRI-1-V01-mhk2x9z0abcd.webp",
    );
    assert.equal(
      storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/stock-items/CM0148-mhk2x9z0abcd.jpg`, "stock-items"),
      "stock-items/CM0148-mhk2x9z0abcd.jpg",
    );
  });
  it("rejects foreign URLs and traversal, encoded or not", () => {
    for (const url of [
      `https://cdn.example.com/variants/CRI-1-mhk2x9z0abcd.webp`,
      `${BASE}/otro-bucket/variants/CRI-1-mhk2x9z0abcd.webp`,
      `${BASE}/${IMAGE_BUCKET}/variants/../stock-items/x.jpg`,
      `${BASE}/${IMAGE_BUCKET}/variants/..%2Fstock-items%2Fx.jpg`,
      `${BASE}/${IMAGE_BUCKET}/variants/sub/CRI-1.webp`,
      `${BASE}/${IMAGE_BUCKET}/variants/..`,
    ]) {
      assert.equal(storagePathFromPublicUrl(url, "variants"), null, url);
    }
  });
});

describe("storagePathFromPublicUrl", () => {
  it("extracts the object path inside our bucket and folder", () => {
    assert.equal(
      storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/variants/CRI-1.webp`, "variants"),
      "variants/CRI-1.webp",
    );
    assert.equal(
      storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/stock-items/INS-1.jpg?t=1`, "stock-items"),
      "stock-items/INS-1.jpg",
    );
  });
  it("decodes percent-encoded names", () => {
    assert.equal(
      storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/stock-items/A%20B.jpg`, "stock-items"),
      "stock-items/A B.jpg",
    );
  });
  it("returns null for other buckets, other folders, traversal or garbage", () => {
    assert.equal(storagePathFromPublicUrl(`${BASE}/otro/variants/x.jpg`, "variants"), null);
    assert.equal(storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/stock-items/x.jpg`, "variants"), null);
    assert.equal(storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/variants/../secret.jpg`, "variants"), null);
    assert.equal(storagePathFromPublicUrl(`${BASE}/${IMAGE_BUCKET}/variants/a/b.jpg`, "variants"), null);
    assert.equal(storagePathFromPublicUrl("https://example.com/foto.jpg", "variants"), null);
    assert.equal(storagePathFromPublicUrl(null, "variants"), null);
  });
});

describe("optionalImageFile", () => {
  it("treats missing entries and empty file inputs as no photo", () => {
    assert.equal(optionalImageFile(null), null);
    assert.equal(optionalImageFile("texto"), null);
    assert.equal(optionalImageFile(new File([], "")), null);
    assert.equal(optionalImageFile(new File([], "a.png", { type: "image/png" })), null);
  });
  it("returns the file when one was picked", () => {
    const file = new File(["x"], "a.png", { type: "image/png" });
    assert.equal(optionalImageFile(file), file);
  });
});

describe("storagePathsForUrls", () => {
  it("maps every URL of our bucket, in either folder, and drops duplicates", () => {
    assert.deepEqual(
      storagePathsForUrls([
        `${BASE}/${IMAGE_BUCKET}/variants/CRI-1-V01.webp`,
        `${BASE}/${IMAGE_BUCKET}/stock-items/CRI-1-V01.jpg?t=2`,
        `${BASE}/${IMAGE_BUCKET}/variants/CRI-1-V01.webp`,
      ]),
      ["variants/CRI-1-V01.webp", "stock-items/CRI-1-V01.jpg"],
    );
  });
  it("skips other buckets, other folders and garbage", () => {
    assert.deepEqual(
      storagePathsForUrls([
        `${BASE}/otro/variants/x.jpg`,
        `${BASE}/${IMAGE_BUCKET}/productos/x.jpg`,
        "https://cdn.example.com/x.jpg",
        "",
      ]),
      [],
    );
  });
});
