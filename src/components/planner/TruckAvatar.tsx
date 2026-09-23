import { Truck } from "lucide-react";

type TruckAvatarProps = {
  fleetNo?: string;
};

/**
 * Compact truck glyph / fleet avatar used on Board truck cards.
 *
 * No reliable truck-photo field exists in the schema, so a truck icon is
 * rendered in a small square. If a real truck-photo field is added later,
 * replace the icon block with an <img>/next/image using that field — no
 * surrounding layout change required.
 */
export default function TruckAvatar({ fleetNo }: TruckAvatarProps) {
  return (
    <div
      aria-hidden="true"
      title={fleetNo ? `Truck ${fleetNo}` : undefined}
      className="h-8 w-8 shrink-0 rounded-md border border-[var(--card-border)]/70 bg-[var(--card-bg)]/50 flex items-center justify-center text-[#06B6D4] dark:text-[#22D3EE]"
    >
      <Truck size={15} strokeWidth={1.75} />
    </div>
  );
}