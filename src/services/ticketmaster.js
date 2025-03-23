const axios = require('axios');
const Event = require('../models/Event');

class TicketmasterScraper {
  constructor() {
    this.apiKey = process.env.TICKETMASTER_API_KEY;
    this.baseUrl = 'https://app.ticketmaster.com/discovery/v2/events';
  }

  async scrape() {
    try {
      const response = await axios.get(`${this.baseUrl}.json`, {
        params: {
          countryCode: 'NG',
          apikey: this.apiKey,
          size: 200
        }
      });

      const events = response.data._embedded?.events || [];

      for (const event of events) {
        await this.saveEvent(event);
      }
    } catch (error) {
      console.error('Ticketmaster API error:', error);
    }
  }

  async saveEvent(eventData) {
    try {
      const venue = eventData._embedded?.venues?.[0];
      const prices = eventData.priceRanges?.[0];

      const event = {
        name: eventData.name,
        description: eventData.description || eventData.info,
        startDate: new Date(eventData.dates.start.dateTime),
        endDate: new Date(eventData.dates.end?.dateTime || eventData.dates.start.dateTime),
        location: {
          address: venue ? `${venue.name}, ${venue.address.line1}` : '',
          city: venue?.city?.name,
          state: venue?.state?.name || this.extractState(venue?.city?.name),
          coordinates: {
            type: 'Point',
            coordinates: [
              parseFloat(venue?.location?.longitude),
              parseFloat(venue?.location?.latitude)
            ]
          }
        },
        category: eventData.classifications?.[0]?.segment?.name,
        price: prices ? {
          amount: prices.min,
          currency: prices.currency
        } : null,
        organizer: {
          name: eventData.promoter?.name,
          contact: eventData.promoter?.description
        },
        imageUrl: eventData.images?.[0]?.url,
        source: 'ticketmaster',
        sourceId: eventData.id
      };

      await Event.findOneAndUpdate(
        { sourceId: event.sourceId, source: 'ticketmaster' },
        event,
        { upsert: true }
      );
    } catch (error) {
      console.error('Error saving Ticketmaster event:', error);
    }
  }

  extractState(city) {
    const cityToState = {
      'Lagos': 'Lagos',
      'Abuja': 'FCT',
      'Port Harcourt': 'Rivers',
      'Kano': 'Kano',
      'Ibadan': 'Oyo',
      'Enugu': 'Enugu'
    };
    return cityToState[city] || 'Unknown';
  }
}

module.exports = new TicketmasterScraper();