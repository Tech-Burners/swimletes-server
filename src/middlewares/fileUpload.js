const multer = require("multer");
const path = require("path");
const fs = require("fs");

module.exports = function (UPLOADS_FOLDER) {
  // Ensure the uploads directory exists
  if (!fs.existsSync(UPLOADS_FOLDER)) {
    fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      if (!fs.existsSync(UPLOADS_FOLDER)) {
        fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
      }
      cb(null, UPLOADS_FOLDER);
    },
    filename: (req, file, cb) => {
      const fileExt = path.extname(file.originalname || "") || "";
      const baseName = path
        .basename(file.originalname || "file", fileExt)
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .toLowerCase() || "file";
      const filename = `${baseName}-${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

      cb(null, filename);
    },
  });

  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 500 * 1024 * 1024, // 500 MB (generous limit so PDF, images, and documents are never blocked by size)
      fieldSize: 50 * 1024 * 1024, // 50 MB
      files: 50, // Allow up to 50 files
    },
    fileFilter: (req, file, cb) => {
      // Allow all files (images, pdfs, documents, media, etc.) across all fields.
      // Format filtering/restrictions are handled by the frontend.
      cb(null, true);
    },
  });

  return upload;
};

