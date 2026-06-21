let counter = 1;

export function generateBookingId(): string {
  const id = `GE-${String(counter).padStart(4, '0')}`;
  counter++;
  return id;
}

export function resetBookingIdCounter(): void {
  counter = 1;
}
