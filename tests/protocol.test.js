import test from 'node:test';
import assert from 'node:assert';
import { MessageType, createMessage } from '../common/protocol.js';
import { MessageFramer } from '../common/framing.js';

test('protocol - create valid messages', () => {
  const msg = createMessage(MessageType.REGISTER, {
    workerId: 'worker-1',
    payload: { cpu: 4 }
  });
  assert.strictEqual(msg.type, MessageType.REGISTER);
  assert.strictEqual(msg.workerId, 'worker-1');
  assert.strictEqual(msg.payload.cpu, 4);
});

test('protocol - reject unknown message type', () => {
  assert.throws(() => {
    createMessage('UNKNOWN_TYPE', {});
  }, /Unknown message type/);
});

test('framing - handles split and batched NDJSON chunks', () => {
  const received = [];
  const framer = new MessageFramer((msg) => received.push(msg));

  // Chunk 1: half of message 1
  framer.feed(Buffer.from('{"type":"HEARTBEAT"'));
  assert.strictEqual(received.length, 0);

  // Chunk 2: second half of message 1 + full message 2 + half of message 3
  framer.feed(Buffer.from(',"workerId":"w1"}\n{"type":"REGISTER"}\n{"type":"TASK'));
  assert.strictEqual(received.length, 2);
  assert.strictEqual(received[0].type, 'HEARTBEAT');
  assert.strictEqual(received[1].type, 'REGISTER');

  // Chunk 3: end of message 3
  framer.feed(Buffer.from('_ASSIGN"}\n'));
  assert.strictEqual(received.length, 3);
  assert.strictEqual(received[2].type, 'TASK_ASSIGN');
});

test('framing - ignores empty lines and safely logs malformed lines', () => {
  const received = [];
  let errorCaught = false;
  const framer = new MessageFramer(
    (msg) => received.push(msg),
    (err) => { errorCaught = true; }
  );

  framer.feed(Buffer.from('\n\n{"type":"HEARTBEAT"}\n{invalid_json}\n\n'));
  assert.strictEqual(received.length, 1);
  assert.strictEqual(received[0].type, 'HEARTBEAT');
  assert.strictEqual(errorCaught, true);
});
