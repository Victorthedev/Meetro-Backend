const Queue = require('bull');

const scraperQueue = new Queue('scraper', process.env.REDIS_URL);
const emailQueue = new Queue('email', process.env.REDIS_URL);

module.exports = {
  scraperQueue,
  emailQueue
};