import { prisma } from '../../lib/prisma';

export async function generateRideId(): Promise<string> {
  const count = await prisma.rideRequest.count();
  const next = count + 1;
  return `GR-${String(next).padStart(4, '0')}`;
}
