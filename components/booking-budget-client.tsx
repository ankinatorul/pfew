"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookingManager, type BookingsProps } from "./booking-manager";
import { BudgetManager, type BudgetProps } from "./budget-manager";
import {
  saveManagedBooking,
  removeManagedBooking,
  saveExpense,
  removeExpense,
  saveMonetaryBudget,
} from "../app/booking-budget-actions";
export function BookingsClient(props: BookingsProps) {
  const router = useRouter();
  return (
    <BookingManager
      {...props}
      LinkComponent={Link}
      save={async (form) => {
        const r = await saveManagedBooking(props.trip.id, form);
        if (!r.error) router.refresh();
        return r;
      }}
      remove={async (b) => {
        const r = await removeManagedBooking(
          props.trip.id,
          b.id,
          b.finance_revision || 0,
        );
        if (!r.error) router.refresh();
        return r;
      }}
    />
  );
}
export function BudgetClient(props: BudgetProps) {
  const router = useRouter();
  return (
    <BudgetManager
      {...props}
      LinkComponent={Link}
      saveExpense={async (input) => {
        const r = await saveExpense(props.trip.id, input);
        if (!r.error) router.refresh();
        return r;
      }}
      removeExpense={async (e) => {
        const r = await removeExpense(
          props.trip.id,
          e.id,
          e.finance_revision || 0,
        );
        if (!r.error) router.refresh();
        return r;
      }}
      saveBudget={async (input) => {
        const r = await saveMonetaryBudget(props.trip.id, input);
        if (!r.error) router.refresh();
        return r;
      }}
    />
  );
}
