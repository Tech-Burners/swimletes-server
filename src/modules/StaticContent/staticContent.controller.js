const response = require("../../helpers/response");
const { addStaticContent, getStaticContent } = require('./staticContent.service');
const catchAsync = require('../../helpers/catchAsync');
const { status } = require("http-status");


const upgradeStaticContent = catchAsync(async (req, res) => {
  const staticContent = await addStaticContent(req.body);
  return res.status(status.CREATED).json(response({ status: 'Success', statusCode: status.CREATED, type: 'staticContent', message: 'staticContent-added', data: staticContent }));
})

const getAllStaticContent = catchAsync(async (req, res) => {
  const type = req.query.type || 'privacy-policy';
  const staticContents = await getStaticContent(type);
  return res.status(status.OK).json(response({ status: 'Success', statusCode: status.OK, type: 'staticContent', message: 'staticContents', data: staticContents }));
})

module.exports = { upgradeStaticContent, getAllStaticContent }