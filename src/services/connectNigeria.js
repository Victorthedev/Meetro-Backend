const axios = require('axios');
const cheerio = require('cheerio');
const Event = require('../../models/Event');

class ConnectNigeriaScraper {
  async scrape() {
    try {
      const response = await axios.get('https://connectnigeria.com/events/');
      const $ = cheerio.load(response.data);
      
      const events = [];
      $('.event-item').each((i, element) => {
        events.push({
          name: $(element).find('.event-title').text().trim(),
          description: $(element).find('.event-excerpt').text().trim(),
          startDate: $(element).find('.event-date').attr('datetime'),
          location: $(element).find('.event-venue').text().trim(),
          imageUrl: $(element).find('img').attr('src')
        });
      });

      await Promise.all(events.map(this.saveEvent));
    } catch (error) {
      console.error('ConnectNigeria scraping error:', error);
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
      source: 'connectnigeria',
      sourceId: Buffer.from(eventData.name + eventData.startDate).toString('base64'),
    };

    await Event.findOneAndUpdate(
      { sourceId: event.sourceId, source: 'connectnigeria' },
      event,
      { upsert: true }
    );
  }

  extractState(location) {
    const states = ['Lagos', 'Abuja', 'Rivers', 'Kano'];
    return states.find(state => location.includes(state)) || 'Unknown';
  }
}

module.exports = new ConnectNigeriaScraper();