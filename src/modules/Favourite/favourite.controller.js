const { default: status } = require("http-status");
const { favouriteUnfavouriteService, myFavouriteService } = require("./favourite.service");
const catchAsync = require("../../helpers/catchAsync");
const response = require("../../helpers/response");


const favouriteUnfavouriteController = catchAsync(async (req, res) => {
  req.body.user = req.User._id;
  const result = await favouriteUnfavouriteService(req.body)
  return res.status(status.CREATED).json(response({ status: 'Success', statusCode: status.CREATED, type: 'favourite', message: 'favourite-added', data: result }));
});


const myFavouriteController = catchAsync(async (req, res) => {
  const result = await myFavouriteService(req.User._id)
  return res.status(status.CREATED).json(response({ status: 'Success', statusCode: status.CREATED, type: 'favourite', message: 'favourite-added', data: result }));
})

module.exports = { favouriteUnfavouriteController, myFavouriteController };