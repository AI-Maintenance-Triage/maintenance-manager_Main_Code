import express, { Router } from "express";
import multer from "multer";
import { storagePut } from "./storage";
import { createContext } from "./_core/context";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

export function registerUploadRoute(app: express.Application) {
  const router = Router();

  router.post("/api/upload", upload.single("file"), async (req: any, res: any) => {
    try {
      // Verify user is authenticated
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const ext = req.file.originalname.split(".").pop() ?? "jpg";
      const randomSuffix = Math.random().toString(36).slice(2, 10);
      const fileKey = `completion-photos/${ctx.user.id}/${Date.now()}-${randomSuffix}.${ext}`;

      const { url } = await storagePut(fileKey, req.file.buffer, req.file.mimetype);

      return res.json({ url, key: fileKey });
    } catch (err: any) {
      console.error("[Upload] Error:", err.message);
      return res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  app.use(router);
}
