export interface BlockEvent {
  eventType: string;
  eventData: any;
  timestamp?: string;
}

export interface BlockData {
  indexNumber: number;
  timestamp: string;
  batchId: string;
  eventType: string;
  eventData: any;
  previousHash: string;
  hash: string;
}
