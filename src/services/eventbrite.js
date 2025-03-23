const puppeteer = require('puppeteer');
const Event = require('../models/Event');

class EventbriteScraper {
  async scrape() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
      await page.goto('https://www.eventbrite.com/d/nigeria--lagos/all-events/');
      
      const events = await page.evaluate(() => {
        const eventCards = document.querySelectorAll('.eds-event-card-content');
        return Array.from(eventCards).map(card => ({
          name: card.querySelector('h3')?.textContent,
          description: card.querySelector('.eds-event-card-content__sub-title')?.textContent,
          startDate: card.querySelector('.eds-event-card-content__primary-content')?.textContent,
          location: card.querySelector('.card-text--truncated')?.textContent,
          imageUrl: card.querySelector('img')?.src
        }));
      });

      await Promise.all(events.map(async (event) => {
        const eventData = {
          name: event.name,
          description: event.description,
          startDate: new Date(event.startDate),
          endDate: new Date(event.startDate),
          location: {
            address: event.location,
            state: this.extractState(event.location),
          },
          source: 'eventbrite',
          sourceId: Buffer.from(event.name).toString('base64'),
        };

        await Event.findOneAndUpdate(
          { sourceId: eventData.sourceId, source: 'eventbrite' },
          eventData,
          { upsert: true }
        );
      }));
    } finally {
      await browser.close();
    }
  }

  extractState(location) {
    const states = ['Lagos', 'Abuja', 'Rivers'];
    return states.find(state => location.includes(state)) || 'Unknown';
  }
}

module.exports = new EventbriteScraper();