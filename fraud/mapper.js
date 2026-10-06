/**
 * Fraud mapper: converts CSV transaction records into key-value pairs.
 * record: { sender_account, receiver_account, amount, timestamp }
 */
export function fraudMap(record) {
  // Key: sender_account
  // Value: { receiver: receiver_account, amount, timestamp }
  return [
    {
      key: record.sender_account,
      value: {
        receiver: record.receiver_account,
        amount: parseFloat(record.amount || 0),
        timestamp: record.timestamp
      }
    }
  ];
}
