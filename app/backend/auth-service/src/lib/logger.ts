/**
 * Minimal structured logger.
 * Outputs JSON lines for easy parsing in AWS CloudWatch and local development.
 */
const logMessage = (level: string, message: string, meta?: object): void => {
  console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...meta }));
};

export const logger = {
  info: (message: string, meta?: object) => logMessage("info", message, meta),
  warn: (message: string, meta?: object) => logMessage("warn", message, meta),
  error: (message: string, meta?: object) => logMessage("error", message, meta),
  debug: (message: string, meta?: object) => logMessage("debug", message, meta),
};
