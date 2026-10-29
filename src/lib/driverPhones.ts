export type DriverPhoneNumber = { label: string; number: string; whatsapp: boolean };

export const MAX_ADDITIONAL_PHONES = 10;

/** One canonical dialling format for local SA and international numbers. */
export function phoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("0")) digits = `27${digits.slice(1)}`;
  return digits;
}

export function isDialablePhone(value: string): boolean {
  return /^[+\d\s().-]+$/.test(value.trim()) && /^\d{7,15}$/.test(phoneDigits(value));
}

/** Validate only newly supplied extra numbers; old primary numbers stay intact. */
export function cleanAdditionalPhones(primary: string, values: DriverPhoneNumber[]): DriverPhoneNumber[] {
  if (values.length > MAX_ADDITIONAL_PHONES) throw new Error(`Add up to ${MAX_ADDITIONAL_PHONES} additional numbers.`);
  const seen = new Map<string, string>();
  if (primary.trim()) seen.set(phoneDigits(primary), "the primary number");
  const result: DriverPhoneNumber[] = [];
  for (const value of values) {
    const number = value.number.trim();
    if (!number) continue;
    const label = value.label.trim();
    if (!label || label.length > 32) throw new Error("Give each number a label of 1–32 characters.");
    if (!isDialablePhone(number)) throw new Error(`Enter a valid phone number for ${label}.`);
    const key = phoneDigits(number);
    if (seen.has(key)) throw new Error(`${number} is listed more than once — it is already used as ${seen.get(key)}.`);
    seen.set(key, label);
    result.push({ label, number, whatsapp: value.whatsapp });
  }
  return result;
}

export function driverContactNumbers(phone?: string, additionalPhones: DriverPhoneNumber[] = []): DriverPhoneNumber[] {
  const numbers = phone?.trim() ? [{ label: "Primary", number: phone, whatsapp: true }, ...additionalPhones] : additionalPhones;
  const seen = new Set<string>();
  return numbers.filter(({ number }) => {
    if (!number.trim()) return false;
    const key = phoneDigits(number) || number.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
