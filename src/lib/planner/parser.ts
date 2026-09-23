import { resolveLocation, resolveClientAlias } from "./aliases";

export type ParsedLoad = {
  sourceLine: number;
  raw: string;
  clientInput: string;
  client?: string;
  fromLocations: string[];
  toLocations: string[];
  valid: boolean;
  errors: string[];
};

export type ParseResult = {
  date?: string;
  dateRaw?: string;
  loads: ParsedLoad[];
  errors: string[];
};

const DATE_REGEX =
  /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/;

function normalizeYear(yearStr: string): number {
  const y = parseInt(yearStr, 10);
  if (yearStr.length === 2) {
    return 2000 + y;
  }
  return y;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function parseDate(raw: string): { date: string; error?: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(DATE_REGEX);
  if (!match) {
    return { date: "", error: `Invalid date format: "${trimmed}"` };
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = normalizeYear(match[3]);

  if (month < 1 || month > 12) {
    return { date: "", error: `Invalid month: ${month}` };
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    return { date: "", error: `Invalid day: ${day} for month ${month}` };
  }
  if (year < 2000 || year > 2099) {
    return { date: "", error: `Invalid year: ${year}` };
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return { date: `${year}-${mm}-${dd}` };
}

function findTokenIndex(lower: string, token: string): number {
  const regex = new RegExp(`(^|\\s)${token}(\\s|$)`);
  const match = regex.exec(lower);
  if (!match) return -1;
  return match.index + (match[1]?.length || 0);
}

function splitLocations(segment: string): string[] {
  return segment
    .split("+")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function hasConsecutivePlus(segment: string): boolean {
  return /\+\+/.test(segment);
}

function parseLoadLine(
  line: string,
  sourceLine: number
): ParsedLoad {
  const raw = line;
  const errors: string[] = [];

  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();

  const xIdx = findTokenIndex(lower, "x");
  const naIdx = findTokenIndex(lower, "na");

  if (xIdx === -1) {
    errors.push('Missing delimiter "x" — expected: CLIENT x FROM na TO');
    return {
      sourceLine,
      raw,
      clientInput: "",
      fromLocations: [],
      toLocations: [],
      valid: false,
      errors,
    };
  }

  if (naIdx === -1) {
    errors.push('Missing delimiter "na" — expected: CLIENT x FROM na TO');
    return {
      sourceLine,
      raw,
      clientInput: trimmed.substring(0, xIdx).trim(),
      fromLocations: [],
      toLocations: [],
      valid: false,
      errors,
    };
  }

  if (naIdx < xIdx) {
    errors.push('"na" appears before "x" — expected: CLIENT x FROM na TO');
    return {
      sourceLine,
      raw,
      clientInput: "",
      fromLocations: [],
      toLocations: [],
      valid: false,
      errors,
    };
  }

  const clientInput = trimmed.substring(0, xIdx).trim();
  const fromSegment = trimmed.substring(xIdx + 2, naIdx).trim();
  const toSegment = trimmed.substring(naIdx + 3).trim();

  if (!clientInput) {
    errors.push("Missing client name");
  }
  if (!fromSegment) {
    errors.push("Missing pickup location(s) after 'x'");
  }
  if (!toSegment) {
    errors.push("Missing delivery location(s) after 'na'");
  }

  const rawFromLocations = splitLocations(fromSegment);
  const rawToLocations = splitLocations(toSegment);

  if (fromSegment && rawFromLocations.length === 0) {
    errors.push("Missing pickup location(s) after 'x'");
  }
  if (toSegment && rawToLocations.length === 0) {
    errors.push("Missing delivery location(s) after 'na'");
  }

  if (fromSegment && hasConsecutivePlus(fromSegment)) {
    errors.push('Malformed pickup locations: empty segment between "+" separators');
  }
  if (toSegment && hasConsecutivePlus(toSegment)) {
    errors.push('Malformed delivery locations: empty segment between "+" separators');
  }

  const fromLocations = rawFromLocations.map(resolveLocation);
  const toLocations = rawToLocations.map(resolveLocation);

  const clientAlias = resolveClientAlias(clientInput);
  const clientResolved = clientAlias || clientInput;

  return {
    sourceLine,
    raw,
    clientInput,
    client: clientResolved,
    fromLocations,
    toLocations,
    valid: errors.length === 0,
    errors,
  };
}

export function parseQuickCapture(text: string): ParseResult {
  const lines = text.split("\n");
  const result: ParseResult = { loads: [], errors: [] };

  let dateFound = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    if (!dateFound) {
      const dateResult = parseDate(trimmed);
      if (dateResult.error) {
        result.errors.push(`Line ${i + 1}: ${dateResult.error}`);
      } else {
        result.date = dateResult.date;
        result.dateRaw = trimmed;
      }
      dateFound = true;
      continue;
    }

    const load = parseLoadLine(trimmed, i + 1);
    result.loads.push(load);
  }

  if (!dateFound) {
    result.errors.push("No date found — first non-empty line must be a date");
  }

  if (result.loads.length === 0 && result.errors.length === 0) {
    result.errors.push("No load lines found after the date");
  }

  return result;
}

export type CustomerRecord = {
  name: string;
  normalizedName: string;
  isActive: boolean;
};

export type ClientResolution = {
  clientInput: string;
  resolved: string | undefined;
  status: "matched" | "unknown" | "ambiguous" | "alias_missing";
  candidates?: string[];
};

export function resolveParsedClients(
  parsed: ParseResult,
  customers: CustomerRecord[]
): ClientResolution[] {
  const seen = new Map<string, ClientResolution>();

  for (const load of parsed.loads) {
    if (seen.has(load.clientInput.toLowerCase())) continue;

    const inputLower = load.clientInput.toLowerCase();
    const alias = resolveClientAlias(load.clientInput);
    const searchName = alias ? alias.toLowerCase() : inputLower;

    const matches = customers.filter((c) => {
      if (!c.isActive) return false;
      return c.normalizedName === searchName || c.name.toLowerCase() === searchName;
    });

    if (alias && matches.length === 0) {
      seen.set(inputLower, {
        clientInput: load.clientInput,
        resolved: undefined,
        status: "alias_missing",
      });
    } else if (matches.length === 0) {
      seen.set(inputLower, {
        clientInput: load.clientInput,
        resolved: undefined,
        status: "unknown",
      });
    } else if (matches.length === 1) {
      seen.set(inputLower, {
        clientInput: load.clientInput,
        resolved: matches[0].name,
        status: "matched",
      });
    } else {
      seen.set(inputLower, {
        clientInput: load.clientInput,
        resolved: undefined,
        status: "ambiguous",
        candidates: matches.map((m) => m.name),
      });
    }
  }

  return Array.from(seen.values());
}
