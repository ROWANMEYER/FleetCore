export type AliasMap = Record<string, string>;

export const LOCATION_ALIASES: AliasMap = {
  kaap: "Cape Town",
  cpt: "Cape Town",
  "cape town": "Cape Town",
  jhb: "Johannesburg",
  jozi: "Johannesburg",
  joburg: "Johannesburg",
  pe: "Gqeberha",
  "port elizabeth": "Gqeberha",
  dbn: "Durban",
  durban: "Durban",
  pta: "Pretoria",
  pretoria: "Pretoria",
  george: "George",
  knysna: "Knysna",
  bredasdorp: "Bredasdorp",
  stellenbosch: "Stellenbosch",
  mosselbaai: "Mossel Bay",
  "mossel bay": "Mossel Bay",
  oudtshoorn: "Oudtshoorn",
  humsdale: "Humsdale",
  wilderness: "Wilderness",
  sedgefield: "Sedgefield",
  plettenberg: "Plettenberg Bay",
  "plettenberg bay": "Plettenberg Bay",
  tsitsikamma: "Tsitsikamma",
  jeffreys: "Jeffreys Bay",
  "jeffreys bay": "Jeffreys Bay",
  consumea: "Consumea",
  heidelberg: "Heidelberg",
  swellendam: "Swellendam",
  hermanus: "Hermanus",
  stanford: "Stanford",
  cango: "Cango",
};

export const CLIENT_ALIASES: AliasMap = {
  cw: "Countrywoods",
};

export function resolveLocation(input: string): string {
  const lower = input.trim().toLowerCase();
  if (LOCATION_ALIASES[lower]) {
    return LOCATION_ALIASES[lower];
  }
  return input
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function resolveClientAlias(input: string): string | undefined {
  const lower = input.trim().toLowerCase();
  return CLIENT_ALIASES[lower];
}
