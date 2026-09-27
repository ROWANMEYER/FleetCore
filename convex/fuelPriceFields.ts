/**
 * The arithmetic behind the diesel price history. These live apart from both the schema and the fuel price functions, because the schema cannot import from a module that imports the generated server code: that cycle stops Convex reading the schema at all.
 *
 * Only a date and a price are ever typed. The movement in rand and the percentage change are worked out from the price before it, so a row can never claim a movement the prices themselves do not support.
 */

/** Far past any real diesel price, and low enough to catch a misplaced decimal: R 310 typed for R 31,00 is refused. */
export const MAX_PRICE = 100;

/** A share of the price, so it can never exceed 100%. */
export const MAX_COMPOSITION = 100;

/** Two decimal places, the precision a per-litre price is published at. */
export const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * What the price moved by since the row before it, in rand a litre. Null on the earliest row, which has nothing to compare against — showing it as R 0,00 would claim the price never moved.
 */
export const priceChange = (price: number, previous: number | null): number | null => previous === null ? null : cents(price - previous);

/** The same movement as a percentage of the price before it. A zero base has no percentage, so it is null rather than a division by zero. */
export const percentChange = (price: number, previous: number | null): number | null => {
  if (previous === null || previous === 0) return null;
  return cents(((price - previous) / previous) * 100);
};

/** The part of a move that the composition actually carries: 50% of the percentage. */
export function compositionEffect(percentChange: number | null, compositionPercent: number | null | undefined): number | null {
  // Nothing to apply to, or nothing to apply it with, so there is no figure to give.
  if (percentChange === null || compositionPercent === null || compositionPercent === undefined) return null;
  return cents(percentChange * (compositionPercent / 100));
}

/**
 * Why a price cannot be recorded, or null when it is fine. Mirrors the server rule so an unfinished form is caught on the page instead of failing the save.
 *
 * Unlike a rate, a diesel price is never legitimately zero: free fuel is a typo, not a discount.
 *
 * The composition is a manual figure the user chooses, so a blank one is a deliberate "not recorded" rather than a fault. A value that is there still has to be a real percentage.
 */
export function priceProblem(draft: { effectiveDate: string; price: string; compositionPercent?: string }): string | null {
  const date = draft.effectiveDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return "needs an effective date";
  const value = Number(draft.price.trim());
  // An empty field is a mistake, not a price of zero: Number("") is 0, so without this a cleared field would quietly record free fuel.
  if (!draft.price.trim() || !Number.isFinite(value)) return "needs a diesel price";
  if (value <= 0) return "needs a price above zero";
  if (value > MAX_PRICE) return `needs a price below ${MAX_PRICE}`;
  const composition = (draft.compositionPercent ?? "").trim();
  if (composition) {
    const percent = Number(composition);
    if (!Number.isFinite(percent)) return "needs a composition of zero or more, or leave it blank";
    if (percent < 0 || percent > MAX_COMPOSITION) return `needs a composition between 0 and ${MAX_COMPOSITION}%`;
  }
  return null;
}
