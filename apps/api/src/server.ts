import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { polymarketRouter } from "./routes/polymarket.js";

const log = pino({ transport: { target: "pino-pretty" } });
const app = express();
const port = parseInt(process.env.PORT || "3001");

// CORS
app.use(cors({
  origin: process.env.WEB_ORIGIN || "http://localhost:5173",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "x-admin-token"],
}));

// Rate limiting
app.use(rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use(express.json());

// Health
app.get("/health", (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Polymarket routes
app.use("/polymarket", polymarketRouter);

app.listen(port, () => {
  log.info(`API server running on http://localhost:${port}`);
});
