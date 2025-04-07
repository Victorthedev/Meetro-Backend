const axios = require('axios');

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.baseUrl = 'https://api.paystack.co';
  }

  async initializePayment(data) {
    try {
      const response = await axios.post(`${this.baseUrl}/transaction/initialize`, data, {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.data;
    } catch (error) {
      throw new Error('Failed to initialize payment');
    }
  }

  async verifyPayment(reference) {
    try {
      const response = await axios.get(`${this.baseUrl}/transaction/verify/${reference}`, {
        headers: {
          Authorization: `Bearer ${this.secretKey}`
        }
      });

      return response.data.data;
    } catch (error) {
      throw new Error('Failed to verify payment');
    }
  }

  async getTransactionDetails(reference) {
    try {
      const response = await axios.get(`${this.baseUrl}/transaction/${reference}`, {
        headers: {
          Authorization: `Bearer ${this.secretKey}`
        }
      });

      return response.data.data;
    } catch (error) {
      throw new Error('Failed to get transaction details');
    }
  }
}

module.exports = new PaystackService();