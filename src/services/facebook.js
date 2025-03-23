const puppeteer = require('puppeteer');
const Event = require('../models/Event');

class FacebookScraper {
  async scrape() {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      
      // Login to Facebook (you'd need to implement this securely)
      await this.login(page);

      // List of Nigerian cities to search for events
      const cities = ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan'];

      for (const city of cities) {
        await this.scrapeCity(page, city);
      }
    } catch (error) {
      console.error('Facebook scraping error:', error);
    } finally {
      await browser.close();
    }
  }

  async login(page) {
    try {
      await page.goto('https://www.facebook.com/login');
      await page.type('#email', process.env.FB_EMAIL);
      await page.type('#pass', process.env.FB_PASSWORD);
      await page.click('#loginbutton');
      await page.waitForNavigation();
    } catch (error) {
      console.error('Facebook login error:', error);
    }
  }

  async scrapeCity(page, city) {
    try {
      await page.goto(`https://www.facebook.com/events/search/?q=${city}%20Nigeria`);
      await page.waitForSelector('[data-testid="event-card"]');

      const events = await page.evaluate((city) => {
        return Array.from(document.querySelectorAll('[data-testid="event-card"]')).map(card => {
          const dateElement = card.querySelector('[data-testid="event-date"]');
          const locationElement = card.querySelector('[data-testid="event-location"]');

          return {
            name: card.querySelector('[data-testid="event-name"]')?.textContent.trim(),
            description: card.querySelector('[data-testid="event-description"]')?.textContent.trim(),
            startDate: dateElement?.getAttribute('data-start-timestamp'),
            endDate: dateElement?.getAttribute('data-end-timestamp'),
            location: locationElement?.textContent.trim(),
            imageUrl: card.querySelector('img')?.src,
            city: city
          };
        });
      }, city);

      for (const event of events) {
        await this.saveEvent(event);
      }
    } catch (error) {
      console.error(`Error scraping Facebook events for ${city}:`, error);
    }
  }

  async saveEvent(eventData) {
    try {
      const event = {
        name: eventData.name,
        description: eventData.description,
        startDate: new Date(parseInt(eventData.startDate)),
        endDate: new Date(parseInt(eventData.endDate || eventData.startDate)),
        location: {
          address: eventData.location,
          state: this.extractState(eventData.city),
        },
        imageUrl: eventData.imageUrl,
        source: 'facebook',
        sourceId: Buffer.from(`${eventData.name}-${eventData.startDate}`).toString('base64')
      };

      await Event.findOneAndUpdate(
        { sourceId: event.sourceId, source: 'facebook' },
        event,
        { upsert: true }
      );
    } catch (error) {
      console.error('Error saving Facebook event:', error);
    }
  }

  extractState(city) {
    const cityToState = {
      'Lagos': 'Lagos',
      'Abuja': 'FCT',
      'Port Harcourt': 'Rivers',
      'Kano': 'Kano',
      'Ibadan': 'Oyo'
    };
    return cityToState[city] || 'Unknown';
  }
}

module.exports = new FacebookScraper();