const catchAsync = require('../helpers/catchAsync')
 
const parseData = () => {
  return catchAsync
  (async (req , res , next ) => {
    if (req?.body?.data) {
      if (typeof req.body.data === 'string') {
        try {
          req.body = JSON.parse(req.body.data);
        } catch (e) {
          // If parsing fails, leave body untouched
        }
      } else if (typeof req.body.data === 'object' && req.body.data !== null) {
        req.body = req.body.data;
      }
    }
    
    next(); 
  });
};


module.exports = parseData;