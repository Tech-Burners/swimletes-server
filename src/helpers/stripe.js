const ApiError = require('./ApiError');
const { status: httpStatus } = require('http-status');

let stripeInstance = null;
let currentKey = null;

/**
 * Lazy initialize Stripe client using STRIPE_SK or STRIPE_SECRET_KEY
 */
const getStripe = () => {
  const secretKey = process.env.STRIPE_SK || process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Stripe secret key is not configured. Please set STRIPE_SK in .env'
    );
  }

  if (!stripeInstance || currentKey !== secretKey) {
    const Stripe = require('stripe');
    stripeInstance = new Stripe(secretKey);
    currentKey = secretKey;
  }

  return stripeInstance;
};

/**
 * Create Stripe PaymentIntent
 * @param {Object} options
 * @param {number} options.amount - Total amount in dollars (e.g. 71.00)
 * @param {string} [options.currency='usd']
 * @param {string} [options.customerId]
 * @param {string} [options.receiptEmail]
 * @param {Object} [options.metadata]
 * @param {string} [options.description]
 */
const createPaymentIntent = async ({
  amount,
  currency = 'usd',
  customerId,
  receiptEmail,
  metadata = {},
  description = 'Swimletes Swimming Lesson Booking'
}) => {
  const stripe = getStripe();
  const amountInCents = Math.round(Number(amount) * 100);

  if (!amountInCents || amountInCents <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment amount');
  }

  const params = {
    amount: amountInCents,
    currency: String(currency || 'usd').toLowerCase(),
    automatic_payment_methods: {
      enabled: true
    },
    metadata,
    description
  };

  if (customerId) params.customer = customerId;
  if (receiptEmail) params.receipt_email = receiptEmail;

  return await stripe.paymentIntents.create(params);
};

/**
 * Retrieve Stripe PaymentIntent
 * @param {string} paymentIntentId
 */
const retrievePaymentIntent = async (paymentIntentId) => {
  const stripe = getStripe();
  return await stripe.paymentIntents.retrieve(paymentIntentId);
};

/**
 * Cancel Stripe PaymentIntent (if not yet captured/succeeded)
 * @param {string} paymentIntentId
 */
const cancelPaymentIntent = async (paymentIntentId) => {
  const stripe = getStripe();
  return await stripe.paymentIntents.cancel(paymentIntentId);
};

/**
 * Refund a Stripe Payment
 * @param {Object} options
 * @param {string} options.paymentIntentId
 * @param {number} [options.amount] - Amount in dollars to refund (if partial)
 * @param {string} [options.reason] - Reason for refund
 * @param {Object} [options.metadata]
 */
const createRefund = async ({ paymentIntentId, amount, reason, metadata = {} }) => {
  const stripe = getStripe();
  const refundParams = {
    payment_intent: paymentIntentId,
    metadata
  };

  if (amount && Number(amount) > 0) {
    refundParams.amount = Math.round(Number(amount) * 100);
  }
  if (reason) {
    refundParams.reason = reason;
  }

  return await stripe.refunds.create(refundParams);
};

/**
 * Create Stripe Checkout Session (Generates hosted payment page URL)
 * @param {Object} options
 * @param {number} options.amount - Total amount in dollars (e.g. 71.00)
 * @param {string} [options.currency='usd']
 * @param {string} [options.customerEmail]
 * @param {string} [options.clientReferenceId] - e.g. bookingId
 * @param {string} options.successUrl
 * @param {string} options.cancelUrl
 * @param {Object} [options.metadata]
 * @param {string} [options.description]
 * @param {Array} [options.lineItems]
 */
const createCheckoutSession = async ({
  amount,
  currency = 'usd',
  customerEmail,
  clientReferenceId,
  successUrl,
  cancelUrl,
  metadata = {},
  description = 'Swimletes Swimming Lesson Booking',
  lineItems
}) => {
  const stripe = getStripe();
  const amountInCents = Math.round(Number(amount) * 100);

  if (!amountInCents || amountInCents <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment amount');
  }

  const items = lineItems || [
    {
      price_data: {
        currency: String(currency || 'usd').toLowerCase(),
        product_data: {
          name: description,
          description: metadata.lessonType ? String(metadata.lessonType) : 'Swimletes Swimming Lesson'
        },
        unit_amount: amountInCents
      },
      quantity: 1
    }
  ];

  const sessionParams = {
    payment_method_types: ['card'],
    line_items: items,
    mode: 'payment',
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl
  };

  if (customerEmail) {
    sessionParams.customer_email = customerEmail;
  }
  if (clientReferenceId) {
    sessionParams.client_reference_id = String(clientReferenceId);
  }

  return await stripe.checkout.sessions.create(sessionParams);
};

/**
 * Retrieve Stripe Checkout Session
 * @param {string} sessionId
 */
const retrieveCheckoutSession = async (sessionId) => {
  const stripe = getStripe();
  return await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent', 'line_items']
  });
};

/**
 * Expire an active Stripe Checkout Session
 * @param {string} sessionId
 */
const expireCheckoutSession = async (sessionId) => {
  const stripe = getStripe();
  return await stripe.checkout.sessions.expire(sessionId);
};

/**
 * Construct Stripe Webhook Event from raw buffer and signature
 */
const constructWebhookEvent = (rawBody, signature, webhookSecret) => {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
};

module.exports = {
  getStripe,
  createPaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  createRefund,
  createCheckoutSession,
  retrieveCheckoutSession,
  expireCheckoutSession,
  constructWebhookEvent
};

