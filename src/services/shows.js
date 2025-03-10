const axios = require('axios');
const cheerio = require('cheerio');
const Event = require('../../models/Event');

class ShowsScraper {
  async scrape() {
    try {
      const response = await axios.get('https://shows.ng/events', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const $ = cheerio.load(response.data);
      const events = [];

      $('.event-listing').each((_, element) => {
        const priceText = $(element).find('.event-price').text();
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0;

        events.push({
          name: $(element).find('.event-name').text().trim(),
          description: $(element).find('.event-description').text().trim(),
          startDate: $(element).find('.event-date').attr('data-date'),
          location: $(element).find('.event-location').text().trim(),
          category: $(element).find('.event-category').text().trim(),
          price: {
            amount: price,
            currency: 'NGN'
          },
          organizer: {
            name: $(element).find('.organizer-name').text().trim(),
            contact: $(element).find('.organizer-contact').text().trim()
          },
          imageUrl: $(element).find('.event-image').attr('src')
        });
      });

      for (const event of events) {
        await this.saveEvent(event);
      }
    } catch (error) {
      console.error('Shows.ng scraping error:', error);
    }
  }

  async saveEvent(eventData) {
    try {
      const event = {
        name: eventData.name,
        description: eventData.description,
        startDate: new Date(eventData.startDate),
        endDate: new Date(eventData.startDate),
        location: {
          address: eventData.location,
          state: this.extractState(eventData.location),
        },
        category: eventData.category,
        price: eventData.price,
        organizer: eventData.organizer,
        imageUrl: eventData.imageUrl,
        source: 'shows',
        sourceId: Buffer.from(`${eventData.name}-${eventData.startDate}`).toString('base64')
      };

      await Event.findOneAndUpdate(
        { sourceId: event.sourceId, source: 'shows' },
        event,
        { upsert: true }
      );
    } catch (error) {
      console.error('Error saving Shows.ng event:', error);
    }
  }

  extractState(location) {
    const states = [
      'Lagos', 'Abuja', 'Rivers', 'Kano', 'Kaduna', 'Oyo', 
      'Enugu', 'Delta', 'Imo', 'Cross River', 'Akwa Ibom', 'Ogun'
    ];
    return states.find(state => location.includes(state)) || 'Unknown';
  }
}

module.exports = new ShowsScraper();