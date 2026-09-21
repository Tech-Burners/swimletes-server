const multer = require("multer");
const path = require("path");

module.exports = function (UPLOADS_FOLDER) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOADS_FOLDER);
    },
    filename: (req, file, cb) => {
      const fileExt = path.extname(file.originalname);
      const filename =
        file.originalname
          .replace(fileExt, "")
          .toLowerCase()
          .split(" ")
          .join("-") +
        "-" +
        Date.now();

      cb(null, filename + fileExt);
    },
  });

  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 200 * 1024 * 1024, // 200 MB
    },
    fileFilter: (req, file, cb) => {
      const field = file.fieldname.toLowerCase();

      // IMAGE CHECK
      const imageTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/avif",
        "image/heic",
        "image/heif",
        "image/gif"
      ];

      // VIDEO CHECK
      const videoTypes = [
        "video/mp4",
        "video/webm",
        "video/ogg"
      ];

      // AUDIO/VOICE CHECK
      const audioTypes = [
        "audio/mpeg",
        "audio/wav",
        "audio/ogg",
        "audio/mp4",
        "audio/webm"
      ];

      // DOCUMENT CHECK
      const docTypes = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain"
      ];

      const allAllowedTypes = [
        ...imageTypes,
        ...docTypes
      ];

      if (/image|avatar|photo|profile/i.test(field)) {
        if (imageTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only image formats (JPEG, PNG, WEBP, HEIC) are allowed for profile photo!"));
      } else if (/video/i.test(field)) {
        if (videoTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only video formats are allowed!"));
      } else if (/audio|voice/i.test(field)) {
        if (audioTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only audio/voice formats are allowed!"));
      } else if (/doc|file|certificate|cert|proof|license|cpr|firstaid|identity|waiver|background/i.test(field)) {
        if (allAllowedTypes.includes(file.mimetype)) cb(null, true);
        else cb(new Error("Only document (PDF, DOCX) and image formats (JPEG, PNG, WEBP) are allowed!"));
      } else {
        if (allAllowedTypes.includes(file.mimetype) || videoTypes.includes(file.mimetype) || audioTypes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(null, true);
        }
      }
    },
  });

  return upload;
};
