import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerLocalAuthRoutes } from "../auth-local";
import { registerUploadRoute } from "../upload";
import { registerStripeWebhookRoute } from "../stripe-webhook";
import { registerInvoiceRoute } from "../invoice";
import { registerInvoiceBulkRoute } from "../invoice-bulk";
import { registerReceiptRoute } from "../receipt";
import { registerPmsWebhookRoute } from "../pms-webhook";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startCronJobs } from "../cron";
import { registerCronRoutes } from "../cron-routes";
import { registerTestSetupRoute } from "../test-setup";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Stripe webhook MUST be registered before express.json() for raw body access
  registerStripeWebhookRoute(app);
  // PMS webhook MUST also be registered before express.json() so the raw body
  // stream is still available for HMAC-SHA256 signature verification.
  // If registered after express.json(), the stream is already drained and
  // rawBody will be empty, causing all signature checks to fail with 401.
  registerPmsWebhookRoute(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Custom email/password auth routes
  registerLocalAuthRoutes(app);
  // File upload endpoint for completion photos
  registerUploadRoute(app);
  // Invoice PDF download endpoint
  registerInvoiceRoute(app);
  // Bulk invoice ZIP export endpoint
  registerInvoiceBulkRoute(app);
  // Contractor payment receipt PDF endpoint
  registerReceiptRoute(app);
  // Cron job HTTP trigger endpoints (protected by x-cron-secret header)
  registerCronRoutes(app);
  // E2E test setup endpoint (only active when TEST_SETUP_SECRET is set)
  registerTestSetupRoute(app);
  // Simple REST health check (used by CI to verify deployment SHA)
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, sha: process.env.GIT_COMMIT_SHA ?? "" });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Catch-all for unknown /api/* routes — return JSON 404 instead of falling through to the SPA
  app.use("/api/*", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start scheduled background jobs
    startCronJobs();
  });
}

startServer().catch(console.error);
