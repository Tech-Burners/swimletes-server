const { default: mongoose } = require("mongoose");
const favouriteModel = require("./favourite.model");
const userModel = require("../User/user.model");

const favouriteUnfavouriteService = async (data) => {
    const isExist = await favouriteModel.findOne({ user: data.user, service: data.service });
    if (isExist) {
        return await favouriteModel.findByIdAndDelete(isExist._id);
    }
    return await favouriteModel.create(data);
}



const myFavouriteService = async (userId) => {

  // ---------- LOGIN USER LOCATION ----------
  const loginUser = await userModel
    .findById(userId)
    .select("location");

  let coordinates = null;

  if (
    loginUser?.location?.coordinates &&
    loginUser.location.coordinates.length === 2
  ) {
    coordinates = loginUser.location.coordinates;
  }

  const pipeline = [
    {
      $match: {
        user: new mongoose.Types.ObjectId(String(userId)),
      },
    },

    // ---------- SERVICE ----------
    {
      $lookup: {
        from: "services",
        localField: "service",
        foreignField: "_id",
        as: "serviceData",
      },
    },
    {
      $unwind: {
        path: "$serviceData",
        preserveNullAndEmptyArrays: false,
      },
    },

    // ---------- PROVIDER ----------
    {
      $lookup: {
        from: "users",
        localField: "serviceData.user",
        foreignField: "_id",
        as: "provider",
      },
    },
    {
      $unwind: {
        path: "$provider",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ---------- PARTNER ----------
    {
      $lookup: {
        from: "partners",
        localField: "provider._id",
        foreignField: "user",
        as: "partner",
      },
    },
    {
      $unwind: {
        path: "$partner",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  // ---------- SAFE DISTANCE ----------
  if (coordinates) {
    pipeline.push({
      $addFields: {
        distance: {
          $cond: [
            {
              $and: [
                { $isArray: "$provider.location.coordinates" },
                {
                  $eq: [
                    { $size: "$provider.location.coordinates" },
                    2,
                  ],
                },
              ],
            },
            {
              $sqrt: {
                $add: [
                  {
                    $pow: [
                      {
                        $subtract: [
                          {
                            $arrayElemAt: [
                              "$provider.location.coordinates",
                              0,
                            ],
                          },
                          coordinates[0],
                        ],
                      },
                      2,
                    ],
                  },
                  {
                    $pow: [
                      {
                        $subtract: [
                          {
                            $arrayElemAt: [
                              "$provider.location.coordinates",
                              1,
                            ],
                          },
                          coordinates[1],
                        ],
                      },
                      2,
                    ],
                  },
                ],
              },
            },
            null, 
          ],
        },
      },
    });
  }

  // ---------- RESPONSE ----------
  pipeline.push({
    $project: {
      _id: 0,

      serviceId: "$serviceData._id",
      name: "$serviceData.name",
      image: "$serviceData.image",
      servicefee: "$serviceData.servicefee",
      avgRating: "$serviceData.avgRating",
      ratingCount: "$serviceData.ratingCount",

      providerName: "$provider.fullName",

      isVerified: {
        $ifNull: ["$partner.isVerified", false],
      },

      isCertified: {
        $ifNull: ["$partner.isCertified", false],
      },

      distance: coordinates
        ? { $round: ["$distance", 2] }
        : null,
    },
  });

  return await favouriteModel.aggregate(pipeline);
};


module.exports = {
    favouriteUnfavouriteService,
    myFavouriteService
}