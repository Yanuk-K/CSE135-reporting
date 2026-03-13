const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const { requireAuth, requireRole } = require("./middleware/auth");
const createStaticRouter = require("./routes/static");
const createActivityRouter = require("./routes/activity");
const createAuthRouter = require("./routes/auth");
const createAnalyticsRouter = require("./routes/analytics");
const createAdminRouter = require("./routes/admin");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: {
      success: false,
      error: "Too many requests. Try again in a minute.",
    },
  });
  app.use("/api", apiLimiter);

  app.set("trust proxy", 1);
  app.use(
    session({
      secret: "very-long-random-secret-1q2w3e4r!",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        maxAge: 1000 * 60 * 60 * 8,
      },
    })
  );

  const swaggerDocument = YAML.load(path.join(__dirname, "openapi.yaml"));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

  const exportsDir = path.join(__dirname, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });
  app.use("/api/exports/files", express.static(exportsDir));

  app.use(createStaticRouter());
  app.use(createActivityRouter());
  app.use(createAuthRouter());
  app.use(createAnalyticsRouter({ requireAuth }));
  app.use(createAdminRouter({ requireAuth, requireRole }));

  return app;
}

module.exports = { createApp };
