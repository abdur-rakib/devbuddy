import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "../src/modules/auth/crypto.js";

describe("crypto", () => {
  const testKey = "a".repeat(64); // 32 bytes hex

  it("encrypts and decrypts a token round-trip", () => {
    const token = "ghp_abc123XYZ456testtoken";
    const encrypted = encrypt(token, testKey);
    expect(encrypted).not.toContain(token);
    const decrypted = decrypt(encrypted, testKey);
    expect(decrypted).toBe(token);
  });

  it("produces different ciphertexts for the same input", () => {
    const token = "ghp_sametoken";
    const enc1 = encrypt(token, testKey);
    const enc2 = encrypt(token, testKey);
    expect(enc1).not.toBe(enc2);
  });

  it("throws on tampered ciphertext", () => {
    const token = "ghp_tampertest";
    const encrypted = encrypt(token, testKey);
    const tampered = encrypted.slice(0, -2) + "ff";
    expect(() => decrypt(tampered, testKey)).toThrow();
  });

  it("throws on wrong key", () => {
    const token = "ghp_wrongkey";
    const encrypted = encrypt(token, "a".repeat(64));
    expect(() => decrypt(encrypted, "b".repeat(64))).toThrow();
  });
});
