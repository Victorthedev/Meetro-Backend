const puppeteer = require('puppeteer');
const Event = require('../../models/Event');

class EventsNigeriaScraper {
  async scrape() {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      await page.goto('https://eventsnigeria.com', {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      const events = await page.evaluate(() => {
        const eventCards = document.querySelectorAll('.event-card');
        return Array.from(eventCards).map(card => {
          const priceElement = card.querySelector('.event-price');
          const price = priceElement ? parseFloat(priceElement.textContent.replace(/[^0-9.]/g, '')) : 0;

          return {
            name: card.querySelector('.event-title')?.textContent.trim(),
            description: card.querySelector('.event-description')?.textContent.trim(),
            startDate: card.querySelector('.event-date')?.getAttribute('data-start-date'),
            endDate: card.querySelector('.event-date')?.getAttribute('data-end-date'),
            location: card.querySelector('.event-venue')?.textContent.trim(),
            category: card.querySelector('.event-category')?.textContent.trim(),
            price: {
              amount: price,
              currency: 'NGN'
            },
            imageUrl: card.querySelector('.event-image')?.getAttribute('src')
          };
        });
      });

      for (const event of events) {
        await this.saveEvent(event);
      }
    } catch (error) {
      console.error('EventsNigeria scraping error:', error);
    } finally {
      await browser.close();
    }
  }

  async saveEvent(eventData) {
    try {
      const event = {
        name: eventData.name,
        description: eventData.description,
        startDate: new Date(eventData.startDate),
        endDate: new Date(eventData.endDate || eventData.startDate),
        location: {
          address: eventData.location,
          state: this.extractState(eventData.location),
          coordinates: await this.getCoordinates(eventData.location)
        },
        category: eventData.category,
        price: eventData.price,
        imageUrl: eventData.imageUrl,
        source: 'eventsnigeria',
        sourceId: Buffer.from(`${eventData.name}-${eventData.startDate}`).toString('base64')
      };

      await Event.findOneAndUpdate(
        { sourceId: event.sourceId, source: 'eventsnigeria' },
        event,
        { upsert: true }
      );
    } catch (error) {
      console.error('Error saving EventsNigeria event:', error);
    }
  }

  extractState(location) {
    const states = [
      'Lagos', 'Abuja', 'Rivers', 'Kano', 'Kaduna', 'Oyo', 'Enugu', 
      'Delta', 'Imo', 'Cross River', 'Akwa Ibom', 'Ogun'
    ];
    return states.find(state => location.includes(state)) || 'Unknown';
  }

  async getCoordinates(address) {
    // This would typically use a geocoding service
    // For now, returning null coordinates
    return {
      type: 'Point',
      coordinates: [null, null]
    };
  }
}

module.exports = new EventsNigeriaScraper();