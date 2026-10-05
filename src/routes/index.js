const express = require('express');
const router = express.Router();
const authRoutes = require('../modules/Auth/auth.route');
const staticContentRoutes = require('../modules/StaticContent/staticContent.route');
const userRoutes = require('../modules/User/user.route');
const availabilityRoutes = require('../modules/Availability/availability.route');
const serviceAndPricingRoutes = require('../modules/ServiceAndPricing/serviceAndPricing.route');
const bookingRoutes = require('../modules/Booking/booking.route');
const reviewRoutes = require('../modules/Review/review.route');
const favouriteRoutes = require('../modules/Favourite/favourite.route');
const reportRoutes = require('../modules/Report/report.route');
const chatRoutes = require('../modules/Chat/chat.route');
const earningsRoutes = require('../modules/Earnings/earnings.route');

const refundRoutes = require('../modules/Booking/refund.route');
const webhookRoutes = require('../modules/Booking/webhook.route');
const { getAdminDashboardOverviewController } = require('../modules/User/user.controller');
const { tokenCheck } = require('../middlewares/auth');

const adminRoutes = express.Router();
adminRoutes.get('/overview', tokenCheck, getAdminDashboardOverviewController);
adminRoutes.get('/dashboard', tokenCheck, getAdminDashboardOverviewController);

const moduleRoutes = [
  {
    path: '/helpers',
    route: webhookRoutes,
  },
  {
    path: '/webhook',
    route: webhookRoutes,
  },
  {
    path: '/weebhook',
    route: webhookRoutes,
  },
  {
    path: '/stripe',
    route: webhookRoutes,
  },
  {
    path: '/auth',
    route: authRoutes,
  },
  {
    path: '/user',
    route: userRoutes
  },
  {
    path: '/users',
    route: userRoutes
  },
  {
    path: '/chat',
    route: chatRoutes
  },
  {
    path: '/messages',
    route: chatRoutes
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
  {
    path: '/bookings',
    route: bookingRoutes
  },
  {
    path: '/payment',
    route: bookingRoutes
  },
  {
    path: '/payments',
    route: bookingRoutes
  },
  {
    path: '/review',
    route: reviewRoutes
  },
  {
    path: '/favourite',
    route: favouriteRoutes
  },
  {
    path: '/report',
    route: reportRoutes
  },
  {
    path: '/reports',
    route: reportRoutes
  },
  {
    path: '/disputes',
    route: reportRoutes
  },
  {
    path: '/earnings',
    route: earningsRoutes
  },
  {
    path: '/transactions',
    route: earningsRoutes
  },
  {
    path: '/withdrawals',
    route: earningsRoutes
  },
  {
    path: '/withdrawal',
    route: earningsRoutes
  },
  {
    path: '/refund',
    route: refundRoutes
  },
  {
    path: '/refunds',
    route: refundRoutes
  },
  {
    path: '/admin',
    route: adminRoutes
  }
];


moduleRoutes.forEach((route) => router.use(route.path, route.route));

module.exports = router;