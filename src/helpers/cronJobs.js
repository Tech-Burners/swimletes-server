const cron = require('node-cron');
const { syncAutoConfirmedBookings, syncAllAcceptedBookings } = require('../modules/Booking/booking.service');

/**
 * Initialize background cron jobs for bookings:
 * 1. Auto-activates accepted bookings when their start time is reached.
 * 2. Auto-confirms lessons after 72 hours (3 days) if the instructor completed and user hasn't responded.
 */
const initCronJobs = () => {
  try {
    // Run initial sync on server startup
    syncAutoConfirmedBookings().catch((err) => {
      console.error('Initial auto-confirm sync error:', err);
    });

    syncAllAcceptedBookings().catch((err) => {
      console.error('Initial accepted bookings sync error:', err);
    });

    // Schedule to run every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
      try {
        await syncAllAcceptedBookings();
        await syncAutoConfirmedBookings();
      } catch (cronErr) {
        console.error('Error running booking sync cron job:', cronErr);
      }
    });

    console.log('---> ⏱️  Booking 72h auto-confirmation and activation cron job initialized (runs every 10m)');
  } catch (error) {
    console.error('Failed to initialize booking cron jobs:', error);
  }
};

module.exports = { initCronJobs };
