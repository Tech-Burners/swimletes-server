const fs = require('fs');

const ensureUploadFolderExists = (folderPath) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true }, (err) => {
      if (err) {
        console.error(`Error creating ${folderPath} folder:`, err);
      } else {
        console.log(`${folderPath} folder created successfully`);
      }
    });
  } else {
    console.log(`${folderPath} folder already exists`);
  }
};

module.exports = ensureUploadFolderExists;