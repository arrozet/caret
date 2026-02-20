/**
 * Minimal structured logger.
 * Outputs JSON lines for easy parsing in AWS CloudWatch and local development.
 */
const log = (level: string, message: string, meta?: object): void => {
  console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...meta }));
};

export const logger = {
  info: (message: string, meta?: object) => log("info", message, meta),
  warn: (message: string, meta?: object) => log("warn", message, meta),
  error: (message: string, meta?: object) => log("error", message, meta),
  debug: (message: string, meta?: object) => log("debug", message, meta),
};
