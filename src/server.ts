import express from "express";
import cors from "cors";
import QRCode from "qrcode";
import db from "./blockchain";

import {
  addBlock,
  getEventsByBatch,
  computeInformationGain
} from "./blockchain";

const app = express();
app.use(express.json());
app.use(cors());

app.post("/batches/create", async (req, res) => {
  try {
    const batchId = "B" + Date.now();

    await addBlock(batchId, "BATCH_CREATED", {});

    const qrCode = await QRCode.toDataURL(batchId);

    res.send({ batchId, qrCode });
  } catch {
    res.status(500).send({ error: "Failed to create batch" });
  }
});

app.post("/events/iot", async (req, res) => {
  try {
    const { batchId, temperature, humidity, lat, lng } = req.body;

    const block = await addBlock(batchId, "IOT_UPDATE", {
      temperature,
      humidity,
      lat,
      lng
    });

    res.send(block);
  } catch {
    res.status(500).send({ error: "Failed to register IoT event" });
  }
});

app.post("/events/dispatched", async (req, res) => {
  try {
    const { batchId, location, lat, lng } = req.body;

    const block = await addBlock(batchId, "DISPATCHED", {
      location,
      lat,
      lng
    });

    res.send(block);
  } catch {
    res.status(500).send({ error: "Failed to register dispatch event" });
  }
});

app.post("/events/received", async (req, res) => {
  try {
    const { batchId, location, lat, lng } = req.body;

    const block = await addBlock(batchId, "RECEIVED", {
      location,
      lat,
      lng
    });

    res.send(block);
  } catch {
    res.status(500).send({ error: "Failed to register receiving event" });
  }
});

app.post("/events/finalized", async (req, res) => {
  try {
    const { batchId, finalizedBy, location, notes, lat, lng } = req.body;

    const block = await addBlock(batchId, "FINALIZED", {
      finalizedBy,
      location,
      notes,
      lat,
      lng
    });

    res.send(block);
  } catch {
    res.status(500).send({ error: "Failed to register finalization event" });
  }
});

app.post("/events/rating", async (req, res) => {
  try {
    const { batchId, rating, lat, lng } = req.body;

    const block = await addBlock(batchId, "RATING", {
      rating,
      lat,
      lng
    });

    res.send(block);
  } catch {
    res.status(500).send({ error: "Failed to register rating" });
  }
});

app.post("/events/inspection", async (req, res) => {
  try {
    const { batchId, rating, inspector, notes, location, lat, lng } = req.body;

    const block = await addBlock(batchId, "QUALITY_INSPECTION", {
      rating,
      inspector,
      notes,
      location,
      lat,
      lng
    });

    res.send(block);
  } catch {
    res.status(500).send({ error: "Failed to register quality inspection" });
  }
});

app.get("/batches/:id/certificate", async (req, res) => {
  try {
    const batchId = req.params.id;
    const events = await getEventsByBatch(batchId);
    const gi = computeInformationGain(events);

    let certificate = "None";

    if (gi >= 80) certificate = "Diamond";
    else if (gi >= 50) certificate = "Gold";
    else if (gi >= 25) certificate = "Silver";
    else if (gi >= 10) certificate = "Bronze";

    res.send({ batchId, gi, certificate, events });
  } catch {
    res.status(500).send({ error: "Failed to calculate certificate" });
  }
});

app.get("/batches/:id/history", async (req, res) => {
  try {
    const batchId = req.params.id;
    const events = await getEventsByBatch(batchId);
    res.send(events);
  } catch {
    res.status(500).send({ error: "Failed to retrieve history" });
  }
});

app.get("/batches", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    db.all(
      `SELECT batchId,
              MIN(timestamp) AS firstEvent,
              MAX(timestamp) AS lastEvent,
              COUNT(*) AS eventCount
       FROM blocks 
       GROUP BY batchId
       ORDER BY lastEvent DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
      async (_, rows: any[]) => {
        const result = [];

        for (const row of rows) {
          const events = await getEventsByBatch(row.batchId);
          const gi = computeInformationGain(events);

          let certificate = "None";
          if (gi >= 80) certificate = "Diamond";
          else if (gi >= 50) certificate = "Gold";
          else if (gi >= 25) certificate = "Silver";
          else if (gi >= 10) certificate = "Bronze";

          result.push({
            batchId: row.batchId,
            firstEvent: row.firstEvent,
            lastEvent: row.lastEvent,
            eventCount: row.eventCount,
            gi,
            certificate
          });
        }

        res.send({ page, limit, batches: result });
      }
    );
  } catch {
    res.status(500).send({ error: "Failed to list batches" });
  }
});

app.get("/batches/:id/map", async (req, res) => {
  try {
    const batchId = req.params.id;

    db.all(
      `SELECT eventType, eventData, timestamp
       FROM blocks
       WHERE batchId = ?
       ORDER BY id ASC`,
      [batchId],
      (_, rows: any[]) => {
        const coords = rows
          .map((r) => {
            const data = JSON.parse(r.eventData);

            if (data.lat && data.lng) {
              return {
                type: r.eventType,
                lat: data.lat,
                lng: data.lng,
                timestamp: r.timestamp
              };
            }

            return null;
          })
          .filter(Boolean);

        res.send({
          batchId,
          count: coords.length,
          coordinates: coords
        });
      }
    );
  } catch {
    res.status(500).send({ error: "Failed to retrieve coordinates" });
  }
});

app.listen(3000, () =>
  console.log("API Blockchain TS running at http://localhost:3000")
);
