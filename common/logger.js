export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LogLevel[process.env.LOG_LEVEL?.toUpperCase()] ?? LogLevel.INFO;

export const logger = {
  debug: (...args) => {
    if (currentLevel <= LogLevel.DEBUG) console.log(new Date().toISOString(), '[DEBUG]', ...args);
  },
  info: (...args) => {
    if (currentLevel <= LogLevel.INFO) console.log(new Date().toISOString(), '[INFO]', ...args);
  },
  warn: (...args) => {
    if (currentLevel <= LogLevel.WARN) console.warn(new Date().toISOString(), '[WARN]', ...args);
  },
  error: (...args) => {
    if (currentLevel <= LogLevel.ERROR) console.error(new Date().toISOString(), '[ERROR]', ...args);
  },
  raw: (...args) => {
    console.log(...args);
  }
};
