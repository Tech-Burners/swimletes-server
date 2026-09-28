const { default: status } = require("http-status");
const {
  favouriteUnfavouriteService,
  myFavouriteService,
  checkIsFavouriteService,
  removeFavouriteService
} = require("./favourite.service");
const catchAsync = require("../../helpers/catchAsync");
const response = require("../../helpers/response");

const favouriteUnfavouriteController = catchAsync(async (req, res) => {
  const result = await favouriteUnfavouriteService(req.User._id, req.body);
  const responseStatus = result.isFavourite ? status.CREATED : status.OK;
  return res.status(responseStatus).json(
    response({
      status: 'OK',
      statusCode: responseStatus,
      type: 'Favourite',
      message: result.message,
      data: result
    })
  );
});

const myFavouriteController = catchAsync(async (req, res) => {
  const result = await myFavouriteService(req.User._id, req.query);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Favourite',
      message: 'Favourites fetched successfully',
      data: result
    })
  );
});

const checkIsFavouriteController = catchAsync(async (req, res) => {
  const targetId = req.params.instructorId || req.params.id;
  const result = await checkIsFavouriteService(req.User._id, targetId);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Favourite',
      message: 'Favourite status checked',
      data: result
    })
  );
});

const removeFavouriteController = catchAsync(async (req, res) => {
  const targetId = req.params.id || req.params.instructorId;
  const result = await removeFavouriteService(req.User._id, targetId);
  return res.status(status.OK).json(
    response({
      status: 'OK',
      statusCode: status.OK,
      type: 'Favourite',
      message: result.message,
      data: result
    })
  );
});

module.exports = {
  favouriteUnfavouriteController,
  myFavouriteController,
  checkIsFavouriteController,
  removeFavouriteController
};
