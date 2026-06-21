export interface WizardState {
  rideType?:      string;
  pickup?:        string;
  dropoff?:       string;
  fare?:          number;
  requestedTime?: string;
  paymentMethod?: string;
}

// keyed by userId
export const wizardState = new Map<string, WizardState>();

// per-user cooldowns (timestamp of last request)
export const rideCooldowns = new Map<string, number>();

export const RIDE_COOLDOWN_MS   = 5 * 60 * 1000; // 5 minutes
export const MAX_ACTIVE_RIDES   = 3;
