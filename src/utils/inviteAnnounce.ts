import type { InviteConfig } from '@prisma/client';

/** Resolve the public invite-reward announce channel (DB config, then env fallback). */
export function resolveAnnounceChannelId(cfg: InviteConfig): string | null {
  if (cfg.announceChannelId && cfg.announceChannelId !== '0') {
    return cfg.announceChannelId;
  }
  const env = process.env['INVITE_ANNOUNCE_CHANNEL_ID'];
  if (env && env !== '0') return env;
  return null;
}
