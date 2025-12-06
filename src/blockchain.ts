import crypto from "crypto";
import sqlite3 from "sqlite3";
import { BlockData, BlockEvent } from "./types";

const db = new sqlite3.Database("./chain.db");

db.run(`
CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indexNumber INTEGER,
  timestamp TEXT,
  batchId TEXT,
  eventType TEXT,
  eventData TEXT,
  previousHash TEXT,
  hash TEXT
)
`);

function calculateHash(data: any): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function getLastBlock(): Promise<BlockData | null> {
  return new Promise((resolve) => {
    db.get(
      "SELECT * FROM blocks ORDER BY id DESC LIMIT 1",
      (_, row: any) => resolve(row || null)
    );
  });
}

export async function addBlock(
  batchId: string,
  eventType: string,
  eventData: any
): Promise<BlockData> {
  const previous = await getLastBlock();

  const block: BlockData = {
    indexNumber: previous ? previous.indexNumber + 1 : 0,
    timestamp: new Date().toISOString(),
    batchId,
    eventType,
    eventData,
    previousHash: previous ? previous.hash : "0",
    hash: ""
  };

  block.hash = calculateHash(block);

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO blocks (indexNumber, timestamp, batchId, eventType, eventData, previousHash, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        block.indexNumber,
        block.timestamp,
        block.batchId,
        block.eventType,
        JSON.stringify(block.eventData),
        block.previousHash,
        block.hash
      ],
      (err: any) => {
        if (err) reject(err);
        resolve(block);
      }
    );
  });
}

export function getEventsByBatch(batchId: string): Promise<BlockEvent[]> {
  return new Promise((resolve) => {
    db.all(
      "SELECT * FROM blocks WHERE batchId = ? ORDER BY id ASC",
      [batchId],
      (_, rows: any[]) => {
        const events = rows.map((r) => ({
          eventType: r.eventType,
          eventData: JSON.parse(r.eventData),
          timestamp: r.timestamp
        }));
        resolve(events);
      }
    );
  });
}

export function computeInformationGain(events: BlockEvent[]): number {
  let score = 0;
  let ratingCount = 0;

  let hasCreated = false;
  let hasFinalized = false;
  let hasAnyIotUpdate = false;

  type Leg = { dispatched?: boolean; received?: boolean };
  const legs: Record<number, Leg> = {};
  let legIndex = 0;

  for (const e of events) {
    if (e.eventType === "BATCH_CREATED") {
      score += 2;
      hasCreated = true;
    }

    if (e.eventType === "IOT_UPDATE") {
      score += 1;
      hasAnyIotUpdate = true;
      if (e.eventData.temperature > 24) score -= 5;
      if (e.eventData.humidity > 90) score -= 3;
    }

    if (e.eventType === "DISPATCHED") {
      legIndex++;
      if (!legs[legIndex]) legs[legIndex] = {};
      legs[legIndex].dispatched = true;
      score += 3;
    }

    if (e.eventType === "RECEIVED") {
      if (!legs[legIndex]) legs[legIndex] = {};
      legs[legIndex].received = true;
      score += 3;
    }

    if (e.eventType === "RATING") {
      ratingCount++;
      const r = e.eventData.rating;
      if (r >= 4) score += 1 * ratingCount;
      else if (r <= 2) score -= 2 * ratingCount;
    }

    if (e.eventType === "QUALITY_INSPECTION") {
      const r = e.eventData.rating;
      if (r >= 4) score += 5;
      else if (r === 3) score += 2;
      else if (r <= 2) score -= 6;
    }

    if (e.eventType === "FINALIZED") {
      hasFinalized = true;
    }
  }

  if (hasFinalized) {
    let completedLegs = 0;
    for (const k in legs) {
      const leg = legs[k];
      if (leg.dispatched && leg.received) completedLegs++;
      if (leg.dispatched && !leg.received) score -= 4;
    }

    const totalLegs = Object.keys(legs).length;
    const ratio = totalLegs > 0 ? completedLegs / totalLegs : 0;

    if (ratio === 1) score += 10;
    else if (ratio >= 0.75) score += 6;
    else if (ratio >= 0.5) score += 2;
    else score -= 5;

    if (!hasAnyIotUpdate) score -= 3;
    if (!hasCreated) score -= 5;
  }

  return score;
}

export default db;
