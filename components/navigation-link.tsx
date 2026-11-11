import type { ElementType } from "react";
import {
  House,
  Luggage,
  CalendarDays,
  Tickets,
  Backpack,
  Files,
  Settings,
  CircleHelp,
  LayoutDashboard,
  MapPin,
  BedDouble,
  TrainFront,
  ListChecks,
  Wallet,
  Map,
  Lightbulb,
  ScanLine,
  BookOpen,
  Users,
  Download,
} from "lucide-react";
import type {
  NavigationIcon,
  NavigationLink as NavigationItem,
} from "../lib/app-navigation";

const icons = {
  home: House,
  trips: Luggage,
  itinerary: CalendarDays,
  bookings: Tickets,
  packing: Backpack,
  documents: Files,
  settings: Settings,
  help: CircleHelp,
  hub: LayoutDashboard,
  destinations: MapPin,
  stays: BedDouble,
  transport: TrainFront,
  prep: ListChecks,
  budget: Wallet,
  map: Map,
  ideas: Lightbulb,
  check: ScanLine,
  research: BookOpen,
  people: Users,
  offline: Download,
} satisfies Record<NavigationIcon, ElementType>;

export function NavigationLink({
  item,
  LinkComponent = "a",
  compact = false,
}: {
  item: NavigationItem;
  LinkComponent?: ElementType;
  compact?: boolean;
}) {
  const Icon = icons[item.icon];
  const content = (
    <>
      <Icon size={20} aria-hidden="true" />
      <span>{compact && item.key === "trips" ? "Trips" : item.label}</span>
    </>
  );
  return item.href ? (
    <LinkComponent
      className="app-nav-link"
      href={item.href}
      aria-current={item.active ? "page" : undefined}
    >
      {content}
    </LinkComponent>
  ) : (
    <span
      className="app-nav-link"
      aria-disabled="true"
      title="Choose or create a trip first"
    >
      {content}
    </span>
  );
}
