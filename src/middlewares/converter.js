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
    await fs.unlink(file.path);

    // Update file properties
    file.filename = pngFileName;
    file.path = pngFilePath;
  } catch (error) {
    throw new Error('Internal server error');
  }
};

// Middleware to convert HEIC files to PNG
const convertHeicToPng = (UPLOADS_FOLDER) => {
  return async (req, res, next) => {
    // Convert single HEIC file if req.file is present
    if (req.file && (req.file.mimetype === 'image/heic' || req.file.mimetype === 'image/heif')) {
      try {
        await convertHeicFileToPng(req.file, UPLOADS_FOLDER);
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    // Convert each HEIC file in req.files if present
    if (req.files) {
      try {
        for (const field in req.files) {
          if (Array.isArray(req.files[field])) {
            for (const file of req.files[field]) {
              if (file.mimetype === 'image/heic' || file.mimetype === 'image/heif') {
                await convertHeicFileToPng(file, UPLOADS_FOLDER);
              }
            }
          }
        }
      } catch (error) {
        return res.status(500).json({ error: error.message });
      }
    }

    next();
  };
};

module.exports = convertHeicToPng;
