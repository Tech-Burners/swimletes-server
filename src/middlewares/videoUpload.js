const multer = require("multer");
const path = require("path");

module.exports = function (UPLOADS_FOLDER) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOADS_FOLDER); // Use the provided destination folder
    },
    filename: (req, file, cb) => {
      const fileExt = path.extname(file.originalname);
      const filename =
        file.originalname
          .replace(fileExt, "")
          .toLocaleLowerCase()
          .split(" ")
          .join("-") +
        "-" +
        Date.now();

      cb(null, filename + fileExt);
    },
  });

  const uploadVideo = multer({
    storage: storage,
    limits: {
      fileSize: 500000000, // 500MB
    },
    fileFilter: (req, file, cb) => {
      if (
        file.mimetype == "video/mp4" ||
        file.mimetype == "video/mkv" ||
        file.mimetype == "video/avi" ||
        file.mimetype == "video/mov"
      ) {
        cb(null, true);
      } else {
        cb(new Error("Only mp4, mkv, avi, and mov formats are allowed!"));
      }
    },
  });

  return uploadVideo;
};
