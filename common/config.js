export const config = {
  masterHost: process.env.MASTER_HOST || 'localhost',
  masterPort: parseInt(process.env.MASTER_PORT || '5050', 10),

  // Worker & Heartbeat
  workerId: process.env.WORKER_ID || '',
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '2000', 10),
  heartbeatMissesAllowed: parseInt(process.env.HEARTBEAT_MISSES_ALLOWED || '3', 10),

  // Fault tolerance & Speculation
  faultToleranceEnabled: process.env.FAULT_TOLERANCE_ENABLED !== 'false',
  speculationEnabled: process.env.SPECULATION_ENABLED === 'true',
  speculationMultiplier: parseFloat(process.env.SPECULATION_MULTIPLIER || '2.0'),

  // Skew-aware balancing
  skewEnabled: process.env.SKEW_ENABLED === 'true',
  skewThreshold: parseFloat(process.env.SKEW_THRESHOLD || '2.0'),

  // Workload limits
  maxCcIterations: parseInt(process.env.MAX_CC_ITERATIONS || '100', 10),
  workerSlowdownMs: parseInt(process.env.WORKER_SLOWDOWN_MS || '0', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};
