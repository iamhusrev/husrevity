import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  GOOGLE_VERIFIER_STORAGE_KEY,
  beginPkce,
  challengeFor,
  clearVerifier,
  generateVerifier,
  readVerifier,
  storeVerifier,
} from "./google-pkce";

describe("google-pkce", () => {
  beforeEach(() => sessionStorage.clear());

  it("generates url-safe verifiers of at least 43 characters that differ each time", () => {
    const a = generateVerifier();
    const b = generateVerifier();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(a).not.toBe(b);
  });

  it("derives the base64url SHA-256 challenge without padding", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const expected = createHash("sha256").update(verifier).digest("base64url");
    expect(await challengeFor(verifier)).toBe(expected);
    expect(await challengeFor(verifier)).not.toMatch(/[=+/]/);
  });

  it("stores, reads and clears the verifier in sessionStorage only", () => {
    storeVerifier("abc");
    expect(readVerifier()).toBe("abc");
    expect(sessionStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBe("abc");
    expect(localStorage.getItem(GOOGLE_VERIFIER_STORAGE_KEY)).toBeNull();
    clearVerifier();
    expect(readVerifier()).toBeNull();
  });

  it("beginPkce stores the verifier whose hash is the returned challenge", async () => {
    const { verifier, challenge } = await beginPkce();
    expect(readVerifier()).toBe(verifier);
    expect(challenge).toBe(await challengeFor(verifier));
  });
});
