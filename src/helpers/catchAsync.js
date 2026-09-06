const catchAsync = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.log("err", err);
      next(err);
    });
  };
};

module.exports = catchAsync;
