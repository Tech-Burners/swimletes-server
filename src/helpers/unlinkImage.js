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
  try {
    if (!fs.existsSync(imagePath)) {
      console.log(`File ${imagePath} does not exist`);
      return;
    }
    const stat = fs.statSync(imagePath);
    if (!stat.isFile()) {
      console.log(`Path ${imagePath} is a directory, skipping unlink`);
      return;
    }
  } catch (err) {
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

