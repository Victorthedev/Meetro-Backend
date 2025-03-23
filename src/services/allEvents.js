const puppeteer = require('puppeteer');
const Event = require('../models/Event');

class AllEventsScraper {
  async scrape() {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
      await page.goto('https://allevents.in/nigeria');
      
      const events = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.event-item')).map(event => ({
          name: event.querySelector('.event-title')?.textContent,
          description: event.querySelector('.event-description')?.textContent,
          startDate: event.querySelector('.event-date')?.getAttribute('data-date'),
          location: event.querySelector('.event-location')?.textContent,
          imageUrl: event.querySelector('img')?.src
        }));
      });

      await Promise.all(events.map(this.saveEvent));
    } finally {
      await browser.close();
    }
  }

  async saveEvent(eventData) {
    const event = {
      name: eventData.name,
      description: eventData.description,
      startDate: new Date(eventData.startDate),
      endDate: new Date(eventData.startDate),
      location: {
        address: eventData.location,
        state: this.extractState(eventData.location),
      },
      source: 'allevents',
      sourceId: Buffer.from(eventData.name + eventData.startDate).toString('base64'),
    };

    await Event.findOneAndUpdate(
      { sourceId: event.sourceId, source: 'allevents' },
      event,
      { upsert: true }
    );
  }

  extractState(location) {
    const states = ['Lagos', 'Abuja', 'Rivers', 'Kano'];
    return states.find(state => location.includes(state)) || 'Unknown';
  }
}

module.exports = new AllEventsScraper();