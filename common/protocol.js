export const MessageType = {
  REGISTER: 'REGISTER',
  REGISTER_ACK: 'REGISTER_ACK',
  HEARTBEAT: 'HEARTBEAT',
  TASK_ASSIGN: 'TASK_ASSIGN',
  TASK_PROGRESS: 'TASK_PROGRESS',
  TASK_RESULT: 'TASK_RESULT',
  TASK_FAILED: 'TASK_FAILED',
  TASK_CANCEL: 'TASK_CANCEL',
  JOB_START: 'JOB_START',
  JOB_STATUS: 'JOB_STATUS',
  JOB_COMPLETE: 'JOB_COMPLETE',
  JOB_FAILED: 'JOB_FAILED',
};

export function createMessage(type, { workerId = '', jobId = '', taskId = '', attemptId = '', payload = {} } = {}) {
  if (!MessageType[type]) {
    throw new Error(`Unknown message type: ${type}`);
  }
  return {
    type,
    workerId,
    jobId,
    taskId,
    attemptId,
    payload,
    timestamp: Date.now()
  };
}
