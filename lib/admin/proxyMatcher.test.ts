import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server.js";

/**
 * Next requires `config` in proxy.ts to be a static literal, so it cannot be
 * imported from a shared module. The test reads that literal from the source
 * to stay in sync with what Next actually compiles.
 */
function proxyMatcher(): string[] {
  const source = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  const found = source.match(/matcher:\s*(\[[^\]]*\])/);
  assert.ok(found, "proxy.ts must declare config.matcher as an array literal");
  return JSON.parse(found[1].replace(/,\s*\]$/, "]")) as string[];
}

const matches = (path: string) =>
  unstable_doesMiddlewareMatch({ config: { matcher: proxyMatcher() }, url: `http://localhost${path}` });

describe("proxy matcher", () => {
  it("protects the admin panel, its login and nested routes", () => {
    for (const path of ["/admin", "/admin/login", "/admin/configuracion", "/admin/productos/insumos/COM-1"]) {
      assert.equal(matches(path), true, path);
    }
  });

  it("skips the catalog PDF upload so its body is not truncated at the proxy's 10 MB buffer", () => {
    assert.equal(matches("/admin/api/catalogo-pdf"), false);
  });

  it("keeps protecting look-alike paths", () => {
    assert.equal(matches("/admin/api/catalogo-pdf-x"), true);
    assert.equal(matches("/admin/api/catalogo-pdf/extra"), true);
  });

  it("never runs on the storefront", () => {
    for (const path of ["/", "/catalogo", "/administrador"]) assert.equal(matches(path), false, path);
  });
});
