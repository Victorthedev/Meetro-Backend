const EventbriteScraper = require('./eventbrite');
const AllEventsScraper = require('./allEvents');
const ConnectNigeriaScraper = require('./connectNigeria');
const EventsNigeriaScraper = require('./eventsNigeria');
const ShowsScraper = require('./shows');
const TicketmasterScraper = require('./ticketmaster');
const FacebookScraper = require('./facebook');
const Event = require('../models/Event');
const { scraperQueue } = require('../config/bull');

class ScraperService {
  constructor() {
    console.log('ScraperService initialized');
    this.scrapers = [
      EventbriteScraper,
      AllEventsScraper,
      ConnectNigeriaScraper,
      EventsNigeriaScraper,
      ShowsScraper,
      // TicketmasterScraper,
      // FacebookScraper
    ];
    
    this.initializeScrapers();
    this.runInitialScrape();
  }

  async runInitialScrape() {
    console.log('Running initial scrape...');
    await scraperQueue.add('scrapeEvents', {});
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
          console.log(`Running ${scraper.constructor.name} scraper...`);
          const result = await scraper.scrape();
          console.log(`${scraper.constructor.name} completed: ${result || 'no return value'}`);
        } catch (error) {
          console.error(`Error in ${scraper.constructor.name}:`, error.stack || error);
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