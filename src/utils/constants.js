const TABLE_NAMES = {
    USERS: process.env.USERS_TABLE,
    EVENTS: process.env.EVENTS_TABLE,
    TICKETS: process.env.TICKETS_TABLE,
    PURCHASES: process.env.PURCHASES_TABLE,
    DONATIONS: process.env.DONATIONS_TABLE,
    SHARES: process.env.SHARES_TABLE,
  };
  
  const BUCKET_NAME = process.env.UPLOAD_BUCKET;
  
  const COGNITO_CONFIG = {
    CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    IDENTITY_POOL_ID: process.env.COGNITO_IDENTITY_POOL_ID,
  };
  
  const API_KEYS = {
    PAYSTACK_SECRET: process.env.PAYSTACK_SECRET_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN,
  };
  
  module.exports = { TABLE_NAMES, BUCKET_NAME, COGNITO_CONFIG, API_KEYS };