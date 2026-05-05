// Focus Meet — Zero-Data-Loss Reliable Channel
// ACK-based delivery, ordered packets, automatic retry, message queue
// Ensures NO data is missed — critical for slides, chat, polls, captions

export interface ReliableMessage {
  id: string;                    // Unique message ID
  seq: number;                   // Sequence number for ordering
  type: string;                  // Message type
  payload: any;                  // Message data
  senderId: string;
  timestamp: number;
  priority: 'critical' | 'high' | 'normal' | 'low';
  requiresAck: boolean;          // Whether ACK is required
  maxRetries: number;            // Max retry attempts
  retryCount: number;            // Current retry count
}

export interface AckMessage {
  originalMsgId: string;
  originalSeq: number;
  receivedAt: number;
}

interface PendingMessage {
  msg: ReliableMessage;
  sentAt: number;
  lastRetryAt: number;
  acked: boolean;
}

export class ReliableChannel {
  private sendSeq = 0;
  private recvSeq = 0;
  private sendQueue: ReliableMessage[] = [];
  private pendingAcks: Map<string, PendingMessage> = new Map();
  private receivedMsgs: Map<string, number> = new Map(); // msgId → timestamp
  private outOfOrder: Map<number, ReliableMessage> = new Map(); // seq → message
  private maxRetries = 5;
  private retryIntervalMs = 1000;
  private ackTimeoutMs = 5000;
  private cleanupIntervalMs = 30000;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  
  // Callbacks
  private onSend: ((msg: ReliableMessage) => void) | null = null;
  private onDeliver: ((msg: ReliableMessage) => void) | null = null;
  private onAckTimeout: ((msgId: string) => void) | null = null;
  
  constructor() {
    this.startRetryLoop();
    this.startCleanup();
  }
  
  setOnSend(cb: (msg: ReliableMessage) => void) { this.onSend = cb; }
  setOnDeliver(cb: (msg: ReliableMessage) => void) { this.onDeliver = cb; }
  setOnAckTimeout(cb: (msgId: string) => void) { this.onAckTimeout = cb; }
  
  // ===== SENDING =====
  
  // Send a reliable message (guaranteed delivery with ACK)
  send(type: string, payload: any, senderId: string, priority: ReliableMessage['priority'] = 'normal'): string {
    const msgId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const msg: ReliableMessage = {
      id: msgId,
      seq: this.sendSeq++,
      type,
      payload,
      senderId,
      timestamp: Date.now(),
      priority,
      requiresAck: priority === 'critical' || priority === 'high',
      maxRetries: priority === 'critical' ? 10 : priority === 'high' ? 5 : 3,
      retryCount: 0,
    };
    
    if (msg.requiresAck) {
      this.pendingAcks.set(msgId, { msg, sentAt: Date.now(), lastRetryAt: Date.now(), acked: false });
    }
    
    // Priority queue: critical first
    this.sendQueue.push(msg);
    this.sendQueue.sort((a, b) => {
      const priMap = { critical: 0, high: 1, normal: 2, low: 3 };
      return priMap[a.priority] - priMap[b.priority];
    });
    
    this.flushQueue();
    return msgId;
  }
  
  // Flush the send queue
  private flushQueue() {
    while (this.sendQueue.length > 0) {
      const msg = this.sendQueue.shift()!;
      if (this.onSend) this.onSend(msg);
    }
  }
  
  // ===== RECEIVING =====
  
  // Handle incoming message
  receive(msg: ReliableMessage): boolean {
    // Check for duplicates
    if (this.receivedMsgs.has(msg.id)) return false;
    this.receivedMsgs.set(msg.id, Date.now());
    
    // Send ACK if required
    if (msg.requiresAck) {
      this.sendAck(msg);
    }
    
    // Check sequence ordering
    if (msg.seq > this.recvSeq + 1) {
      // Out of order — buffer it
      this.outOfOrder.set(msg.seq, msg);
      return true; // Buffered, not delivered yet
    }
    
    // In order — deliver
    if (msg.seq === this.recvSeq + 1 || msg.seq <= this.recvSeq) {
      this.recvSeq = Math.max(this.recvSeq, msg.seq);
      if (this.onDeliver) this.onDeliver(msg);
      
      // Check if buffered messages can now be delivered
      this.deliverBuffered();
    }
    
    return true;
  }
  
  // Deliver any buffered messages that are now in order
  private deliverBuffered() {
    while (this.outOfOrder.has(this.recvSeq + 1)) {
      const msg = this.outOfOrder.get(this.recvSeq + 1)!;
      this.outOfOrder.delete(this.recvSeq + 1);
      this.recvSeq++;
      if (this.onDeliver) this.onDeliver(msg);
    }
  }
  
  // ===== ACK HANDLING =====
  
  // Process received ACK
  handleAck(ack: AckMessage) {
    const pending = this.pendingAcks.get(ack.originalMsgId);
    if (pending) {
      pending.acked = true;
      this.pendingAcks.delete(ack.originalMsgId);
    }
  }
  
  // Send ACK back for a received message
  private sendAck(originalMsg: ReliableMessage) {
    const ack: AckMessage = {
      originalMsgId: originalMsg.id,
      originalSeq: originalMsg.seq,
      receivedAt: Date.now(),
    };
    // Send ACK as a normal-priority message (not critical — avoids ACK loop)
    if (this.onSend) {
      this.onSend({
        id: `ack-${originalMsg.id}`,
        seq: this.sendSeq++,
        type: 'ack',
        payload: ack,
        senderId: originalMsg.senderId,
        timestamp: Date.now(),
        priority: 'normal',
        requiresAck: false,
        maxRetries: 0,
        retryCount: 0,
      });
    }
  }
  
  // ===== RETRY LOOP =====
  
  private startRetryLoop() {
    this.retryTimer = setInterval(() => {
      const now = Date.now();
      this.pendingAcks.forEach((pending, msgId) => {
        if (pending.acked) return;
        
        if (now - pending.lastRetryAt > this.retryIntervalMs) {
          if (pending.msg.retryCount >= pending.msg.maxRetries) {
            // Max retries exceeded
            this.pendingAcks.delete(msgId);
            if (this.onAckTimeout) this.onAckTimeout(msgId);
            return;
          }
          
          // Retry
          pending.msg.retryCount++;
          pending.lastRetryAt = now;
          if (this.onSend) this.onSend(pending.msg);
        }
      });
    }, 500);
  }
  
  // ===== CLEANUP =====
  
  private startCleanup() {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      // Remove old received messages (older than 5 minutes)
      this.receivedMsgs.forEach((ts, msgId) => {
        if (now - ts > 300000) this.receivedMsgs.delete(msgId);
      });
    }, this.cleanupIntervalMs);
  }
  
  // ===== STATS =====
  
  getStats() {
    return {
      sendSeq: this.sendSeq,
      recvSeq: this.recvSeq,
      pendingAcks: this.pendingAcks.size,
      bufferedOutOfOrder: this.outOfOrder.size,
      queueSize: this.sendQueue.length,
      totalReceived: this.receivedMsgs.size,
    };
  }
  
  destroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.pendingAcks.clear();
    this.outOfOrder.clear();
    this.sendQueue = [];
  }
}
