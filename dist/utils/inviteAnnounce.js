"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAnnounceChannelId = resolveAnnounceChannelId;
/** Resolve the public invite-reward announce channel (DB config, then env fallback). */
function resolveAnnounceChannelId(cfg) {
    if (cfg.announceChannelId && cfg.announceChannelId !== '0') {
        return cfg.announceChannelId;
    }
    const env = process.env['INVITE_ANNOUNCE_CHANNEL_ID'];
    if (env && env !== '0')
        return env;
    return null;
}
