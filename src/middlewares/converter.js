const fs = require('fs').promises;
const path = require('path');
const convert = require('heic-convert');

// Function to convert a single HEIC file to PNG
const convertHeicFileToPng = async (file, UPLOADS_FOLDER) => {
  try {
    const heicBuffer = await fs.readFile(file.path);
    const pngBuffer = await convert({
      buffer: heicBuffer,
      format: 'PNG'
    });

    const originalFileName = path.basename(file.originalname, path.extname(file.originalname));
    const currentDateTime = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, ''); // Format current date and time
    const pngFileName = `${originalFileName}_${currentDateTime}.png`; // Add current date and time to file name
    const pngFilePath = path.join(UPLOADS_FOLDER, pngFileName);

    await fs.writeFile(pngFilePath, pngBuffer);

    // Remove the original HEIC file
    await fs.unlink(file.path).catch(() => {});

    // Update file properties
    file.filename = pngFileName;
    file.path = pngFilePath;
    file.mimetype = 'image/png';
  } catch (error) {
    // If conversion fails, keep the original file without crashing the upload
    console.warn(`HEIC conversion skipped for ${file.originalname || file.filename}:`, error.message);
  }
};

// Middleware to convert HEIC files to PNG
const convertHeicToPng = (UPLOADS_FOLDER) => {
  return async (req, res, next) => {
    try {
      const isHeic = (file) =>
        file &&
        (file.mimetype === 'image/heic' ||
          file.mimetype === 'image/heif' ||
          /\.heic$/i.test(file.originalname || '') ||
          /\.heif$/i.test(file.originalname || ''));

      // Convert single HEIC file if req.file is present
      if (req.file && isHeic(req.file)) {
        await convertHeicFileToPng(req.file, UPLOADS_FOLDER);
      }

      // Convert each HEIC file in req.files if present
      if (req.files) {
        if (Array.isArray(req.files)) {
          for (const file of req.files) {
            if (isHeic(file)) {
              await convertHeicFileToPng(file, UPLOADS_FOLDER);
            }
          }
        } else {
          for (const field in req.files) {
            const fieldVal = req.files[field];
            if (Array.isArray(fieldVal)) {
              for (const file of fieldVal) {
                if (isHeic(file)) {
                  await convertHeicFileToPng(file, UPLOADS_FOLDER);
                }
              }
            } else if (isHeic(fieldVal)) {
              await convertHeicFileToPng(fieldVal, UPLOADS_FOLDER);
            }
          }
        }
      }
    } catch (err) {
      console.warn('HEIC converter middleware warning:', err.message);
    }

    next();
  };
};

module.exports = convertHeicToPng;
