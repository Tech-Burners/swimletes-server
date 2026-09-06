const express = require('express');
const router = express.Router();
const authRoutes = require('../modules/Auth/auth.route');
const staticContentRoutes = require('../modules/StaticContent/staticContent.route');
const userRoutes = require('../modules/User/user.route');
const availabilityRoutes = require('../modules/Availability/availability.route');
const serviceAndPricingRoutes = require('../modules/ServiceAndPricing/serviceAndPricing.route');
const bookingRoutes = require('../modules/Booking/booking.route');


const moduleRoutes = [
  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: '/user',
    route: userRoutes
  },
  {
    path: '/static-contents',
    route: staticContentRoutes
  },
  {
    path: '/availability',
    route: availabilityRoutes
  },
  {
    path: '/service-and-pricing',
    route: serviceAndPricingRoutes
  },
  {
    path: '/booking',
    route: bookingRoutes
  },
];


moduleRoutes.forEach((route) => router.use(route.path, route.route));

module.exports = router;