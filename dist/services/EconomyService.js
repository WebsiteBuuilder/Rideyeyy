"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InsufficientFundsError = void 0;
class InsufficientFundsError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InsufficientFundsError';
    }
}
exports.InsufficientFundsError = InsufficientFundsError;
//# sourceMappingURL=EconomyService.js.map