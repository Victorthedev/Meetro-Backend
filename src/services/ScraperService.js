const EventbriteScraper = require('./scrapers/eventbrite');
const AllEventsScraper = require('./scrapers/allEvents');
const ConnectNigeriaScraper = require('./scrapers/connectNigeria');
const EventsNigeriaScraper = require('./scrapers/eventsNigeria');
const ShowsScraper = require('./scrapers/shows');
const TicketmasterScraper = require('./scrapers/ticketmaster');
const FacebookScraper = require('./scrapers/facebook');
const Event = require('../models/Event');
const { scraperQueue } = require('../config/bull');

class ScraperService {
  constructor() {
    this.scrapers = [
      EventbriteScraper,
      AllEventsScraper,
      ConnectNigeriaScraper,
      EventsNigeriaScraper,
      ShowsScraper,
      TicketmasterScraper,
      FacebookScraper
    ];
    
    this.initializeScrapers();
  }

  initializeScrapers() {
    // Run scraping every 6 hours
    scraperQueue.add('scrapeEvents', {}, {
      repeat: { cron: '0 */6 * * *' }
    });

    // Clean old events every day at 1 AM WAT (GMT+1)
    scraperQueue.add('cleanOldEvents', {}, {
      repeat: { cron: '0 1 * * *' }
    });

    this.processScraperQueue();
  }

  async processScraperQueue() {
    scraperQueue.process('scrapeEvents', async (job) => {
      console.log('Starting event scraping...');
      
      for (const scraper of this.scrapers) {
        try {
          await scraper.scrape();
        } catch (error) {
          console.error(`Error in ${scraper.constructor.name}:`, error);
        }
      }
    });

    scraperQueue.process('cleanOldEvents', async (job) => {
      const nowWAT = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
      
      await Event.deleteMany({
        endDate: { $lt: nowWAT }
      });
    });
  }
}

module.exports = new ScraperService();