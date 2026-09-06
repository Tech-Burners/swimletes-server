const catchAsync = require('../helpers/catchAsync')
 
const parseData = () => {
  return catchAsync
  (async (req , res , next ) => {
    if (req?.body?.data) {
      req.body = JSON.parse(req.body.data);
    }
    
    next(); 
  });
};


module.exports = parseData;