'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const areaRouter = require('./router/areaRouter');
const routeRouter = require('./router/routeRouter');
const roadRouter = require('./router/roadRouter');
const { errorHandler } = require('./middleware/errorHandler');
const { verifyConnectivity } = require('./infra/neo4j');
const { closeRedis } = require('./infra/redis');
const { startAqiWorker, stopAqiWorker } = require('./worker/aqiSyncWorker');

const app = express();
const PORT = process.env.PORT || 3000;
const API_PREFIX = '/api/v1';

// ── Security & parsing ────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
}));
app.use(express.json({ limit: '10kb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
});
app.use(limiter);

// ── Health check (no auth) ────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use(`${API_PREFIX}/areas`, areaRouter);
app.use(`${API_PREFIX}/roads`, roadRouter);
app.use(`${API_PREFIX}/routes`, routeRouter);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'The requested endpoint does not exist.' });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
    try {
        // Run SQLite migrations
        require('./db/migrate');

        // Verify Neo4j connectivity and schema constraints/indexes
        await verifyConnectivity();

        app.listen(PORT, () => {
            console.log(`Eco-Route Finder API running on http://localhost:${PORT}`);
            console.log(`API prefix: ${API_PREFIX}`);
            console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

            // Start background AQI sync worker for Urban Anchors (default 5s, configurable)
            if (process.env.ENABLE_AQI_WORKER !== 'false') {
                const intervalMs = process.env.AQI_WORKER_INTERVAL_MS ? parseInt(process.env.AQI_WORKER_INTERVAL_MS, 10) : 5000;
                startAqiWorker(intervalMs);
            }
        });
    } catch (err) {
        console.error('❌  Failed to start server:', err.message);
        process.exit(1);
    }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
async function shutdown(signal) {
    console.log(`${signal} received. Shutting down gracefully…`);
    stopAqiWorker();
    const { closeDriver } = require('./infra/neo4j');
    await Promise.allSettled([closeDriver(), closeRedis()]);
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (require.main === module) {
    start();
}

module.exports = { app, start, shutdown };
