const axios = require('axios');

exports.handler = async (event) => {
  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { accountNumber, bankCode } = body;

    if (!accountNumber || !bankCode) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Account number and bank code are required' })
      };
    }

    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        isValid: true,
        accountName: response.data.data.account_name,
        bankCode,
        accountNumber
      })
    };
  } catch (error) {
    console.error('Bank verification failed:', error.response?.data || error.message);
    return {
      statusCode: 400,
      body: JSON.stringify({
        isValid: false,
        error: error.response?.data?.message || 'Bank account verification failed'
      })
    };
  }
};