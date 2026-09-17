const express = require('express');
const { auth } = require('../../middlewares/auth');
const {
  favouriteUnfavouriteController,
  myFavouriteController,
  checkIsFavouriteController,
  removeFavouriteController
} = require('./favourite.controller');

const router = express.Router();

router.post('/', auth(['user', 'instructor', 'admin']), favouriteUnfavouriteController);
router.get('/my-fav', auth(['user', 'instructor', 'admin']), myFavouriteController);
router.get('/', auth(['user', 'instructor', 'admin']), myFavouriteController);
router.get('/check/:instructorId', auth(['user', 'instructor', 'admin']), checkIsFavouriteController);
router.delete('/:id', auth(['user', 'instructor', 'admin']), removeFavouriteController);

module.exports = router;
