const StaticContent = require('./staticContent.model');

const addStaticContent = async (staticContentBody) => {
  let staticContent = await findStaticContent({type: staticContentBody.type, targetAudience: staticContentBody.targetAudience});
  if (staticContent) {
    staticContent.content = staticContentBody.content;
  }
  else {
    staticContent = new StaticContent(staticContentBody);
  }
  await staticContent.save();
  return staticContent;
}

const findStaticContent = async (filter) => {
  const staticContent = await StaticContent.findOne(filter);
  return staticContent;
}

const getStaticContent = async (type) => {
  return await StaticContent.find({ type }).select('content targetAudience');
}

module.exports = {
  addStaticContent,
  getStaticContent
}
