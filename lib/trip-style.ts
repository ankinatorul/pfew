// UI vocabulary maps onto the existing database constraint and recommendation tier.
export const travelStyles = [
  {
    value: "Budget",
    stored: "Budget",
    description: "Affordable options, free activities and good value.",
  },
  {
    value: "Balanced",
    stored: "Comfort",
    description: "A mix of comfort, cost and experiences.",
  },
  {
    value: "Premium",
    stored: "Luxury",
    description: "Higher-comfort stays and special experiences.",
  },
] as const;
export type TravelStyle = (typeof travelStyles)[number]["value"];
export function travelStyleLabel(stored: string): TravelStyle {
  return (
    travelStyles.find((s) => s.stored === stored || s.value === stored)
      ?.value || "Balanced"
  );
}
export function storedTravelStyle(label: TravelStyle) {
  return travelStyles.find((s) => s.value === label)!.stored;
}
