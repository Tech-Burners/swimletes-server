const catchAsync = require('../../helpers/catchAsync');
const response = require('../../helpers/response');
const { status } = require('http-status');
const { createReviewService } = require('./review.service');

// Mutual Review: User -> Instructor OR Instructor -> User
const createReview = catchAsync(async (req, res) => {
  const result = await createReviewService(req.User._id, req.body);
  return res.status(status.CREATED).json(
    response({
      status: 'OK',
      statusCode: status.CREATED,
      type: 'Review',
      message: 'Review submitted successfully',
      data: result
    })
  );
});

module.exports = {
  createReview
};
