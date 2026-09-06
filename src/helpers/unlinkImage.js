const fs = require("fs");
const path = require("path");

function unlinkImage(imgPath) {
  if (!imgPath || typeof imgPath !== "string") return;
  var imagePath;
  const cleanPath = imgPath.replace(/^[\\\/]+/, "");
  if (cleanPath.startsWith("public")) {
    imagePath = cleanPath;
  } else {
    imagePath = path.join("public", cleanPath);
  }

  console.log("File Path ---> ", imgPath, imagePath);
  const fileExists = fs.existsSync(imagePath);
  if (!fileExists) {
    console.log(`File ${imagePath} does not exist`);
    return;
  }

  fs.unlink(imagePath, (err) => {
    if (err) {
      console.error(`Error deleting the file ${imagePath}:`, err);
    } else {
      console.log(`File ${imagePath} deleted successfully`);
    }
  });
}

module.exports = unlinkImage;

