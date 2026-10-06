import net from 'net';
import os from 'os';
import { MessageType, createMessage } from '../common/protocol.js';
import { MessageFramer } from '../common/framing.js';
import { TaskExecutor } from './TaskExecutor.js';

export class Worker {
  constructor({
    workerId = process.env.WORKER_ID || `worker-${os.hostname().slice(0, 8)}`,
    masterHost = process.env.MASTER_HOST || 'localhost',
    masterPort = parseInt(process.env.MASTER_PORT || '5050', 10),
    heartbeatIntervalMs = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '2000', 10),
    workerSlowdownMs = parseInt(process.env.WORKER_SLOWDOWN_MS || '0', 10)
  } = {}) {
    this.workerId = workerId;
    this.masterHost = masterHost;
    this.masterPort = masterPort;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.socket = null;
    this.heartbeatTimer = null;
    this.executor = new TaskExecutor({ workerSlowdownMs });
    this.currentTask = null;
    this.isRegistered = false;
    this.closing = false;
  }

  start() {
    console.log(`[WORKER ${this.workerId}] Starting`);
    this.connect();
  }

  connect() {
    if (this.closing) return;
    this.socket = new net.Socket();

    const framer = new MessageFramer(
      (msg) => this.handleMessage(msg),
      (err) => console.error(`[WORKER ${this.workerId}] Framer error:`, err.message)
    );

    this.socket.on('data', (data) => framer.feed(data));

    this.socket.on('connect', () => {
      this.send(createMessage(MessageType.REGISTER, {
        workerId: this.workerId,
        payload: {
          hostname: os.hostname(),
          pid: process.pid
        }
      }));
    });

    this.socket.on('close', () => {
      this.stopHeartbeat();
      this.isRegistered = false;
      if (!this.closing) {
        setTimeout(() => this.connect(), 2000);
      }
    });

    this.socket.on('error', (err) => {
      // Reconnection handled on 'close'
    });

    this.socket.connect(this.masterPort, this.masterHost);
  }

  send(msg) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(MessageFramer.frame(msg));
    }
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(createMessage(MessageType.HEARTBEAT, {
        workerId: this.workerId,
        payload: {
          busy: !!this.currentTask,
          currentTaskId: this.currentTask?.taskId || null
        }
      }));
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async handleMessage(msg) {
    switch (msg.type) {
      case MessageType.REGISTER_ACK:
        this.isRegistered = true;
        console.log(`[WORKER ${this.workerId}] Registered with master`);
        this.startHeartbeat();
        break;

      case MessageType.TASK_ASSIGN:
        this.executeAssignedTask(msg);
        break;

      case MessageType.TASK_CANCEL:
        if (this.currentTask && this.currentTask.attemptId === msg.attemptId) {
          console.log(`[WORKER ${this.workerId}] Received cancellation for attempt ${msg.attemptId}`);
          this.currentTask = null;
        }
        break;

      default:
        // Ignore unhandled message types safely
        break;
    }
  }

  async executeAssignedTask(msg) {
    const { jobId, taskId, attemptId, payload } = msg;
    this.currentTask = { taskId, attemptId };

    try {
      this.send(createMessage(MessageType.TASK_PROGRESS, {
        workerId: this.workerId,
        jobId,
        taskId,
        attemptId,
        payload: { progress: 0 }
      }));

      const result = await this.executor.executeTask(payload);

      // Verify task wasn't cancelled mid-flight
      if (this.currentTask && this.currentTask.attemptId === attemptId) {
        this.send(createMessage(MessageType.TASK_RESULT, {
          workerId: this.workerId,
          jobId,
          taskId,
          attemptId,
          payload: { result }
        }));
        this.currentTask = null;
      }
    } catch (err) {
      console.error(`[WORKER ${this.workerId}] Task failed ${attemptId}:`, err);
      this.send(createMessage(MessageType.TASK_FAILED, {
        workerId: this.workerId,
        jobId,
        taskId,
        attemptId,
        payload: { error: err.message }
      }));
      this.currentTask = null;
    }
  }

  stop() {
    this.closing = true;
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.destroy();
    }
  }
}
