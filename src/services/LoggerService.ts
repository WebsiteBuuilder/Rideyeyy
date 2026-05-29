import winston from 'winston';
import { config } from '../config';

export interface LogContext {
  userId?: string;
  commandName?: string;
  transactionId?: string;
  [key: string]: unknown;
}

export class LoggerService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const ctx = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level.toUpperCase()}] ${message}${ctx}`;
        })
      ),
      transports: [new winston.transports.Console()],
    });
  }

  private formatMessage(message: string, context?: LogContext): string {
    return message;
  }

  private meta(context?: LogContext): Record<string, unknown> {
    return context ?? {};
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(this.formatMessage(message, context), this.meta(context));
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(this.formatMessage(message, context), this.meta(context));
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(this.formatMessage(message, context), this.meta(context));
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(this.formatMessage(message, context), this.meta(context));
  }
}
