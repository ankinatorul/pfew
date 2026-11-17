type Reply = { error?: string };
export async function changeDestination(input: unknown): Promise<Reply> {
  return (
    globalThis as unknown as { pfewDestinationChange: (v: unknown) => Reply }
  ).pfewDestinationChange(input);
}
export async function reorderDestinations(input: unknown): Promise<Reply> {
  return (
    globalThis as unknown as { pfewDestinationOrder: (v: unknown) => Reply }
  ).pfewDestinationOrder(input);
}
