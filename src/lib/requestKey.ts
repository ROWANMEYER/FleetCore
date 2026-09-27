const requestKeyPattern = /^[a-zA-Z0-9-]{16,80}$/;

/** Unique client key that always matches the server requestKey contract: crypto.randomUUID where available (secure contexts only), otherwise 32 hex characters from getRandomValues. */
export function newRequestKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      const key = crypto.randomUUID();
      if (requestKeyPattern.test(key)) return key;
    }
  } catch {
    /* insecure context */
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
