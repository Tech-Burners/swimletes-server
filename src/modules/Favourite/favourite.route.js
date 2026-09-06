const express = require("express");
const { auth } = require("../../middlewares/auth");
const { addFavourite, unFavourite, favouriteUnfavouriteController, myFavouriteController } = require("./favourite.controller");
const router = express.Router();

router.post("/", auth(['user']), favouriteUnfavouriteController);
router.get("/my-fav", auth(['user']), myFavouriteController);


module.exports = router;