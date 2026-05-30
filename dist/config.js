"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    limits: {
        gambleCooldownMs: 2000,
        crateCooldownMs: 3000,
        commandCooldownMs: 1000,
    },
    daily: {
        reward: 100,
        cooldownHours: 24,
        streakBonus: 10,
        maxStreak: 7,
    },
    crates: {
        bronze: 50,
        silver: 100,
        gold: 250,
    },
    roles: {
        admin: '0',
        staff: '0',
    },
};
//# sourceMappingURL=config.js.map