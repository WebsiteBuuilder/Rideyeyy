// Local type definitions matching the Prisma schema.
// These are used at compile time so TypeScript can check our code
// without needing Prisma to generate its client first.

export interface RideRequest {
  id:            string;
  rideId:        string;
  customerId:    string;
  providerId:    string | null;
  channelId:     string | null;
  rideType:      string;
  pickup:        string;
  dropoff:       string;
  fare:          number;
  requestedTime: string;
  paymentMethod: string;
  status:        string;
  rating:        number | null;
  notes:         string | null;
  createdAt:     Date;
  updatedAt:     Date;
}

export interface ProviderStats {
  id:             string;
  providerId:     string;
  totalRides:     number;
  completedRides: number;
  cancelledRides: number;
  totalRevenue:   number;
  averageRating:  number;
  createdAt:      Date;
}

export interface CustomerStats {
  id:             string;
  customerId:     string;
  totalRequests:  number;
  completedRides: number;
  cancelledRides: number;
  totalSpent:     number;
  createdAt:      Date;
}

export interface BlacklistedUser {
  id:        string;
  userId:    string;
  reason:    string;
  createdAt: Date;
}
