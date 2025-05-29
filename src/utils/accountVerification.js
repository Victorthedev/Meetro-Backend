const axios = require('axios');

async function verifyBankDetails(accountNumber, bankCode) {
  try {
    const response = await axios.get(
      `https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`
        }
      }
    );
    
    return {
      isValid: true,
      accountName: response.data.data.account_name,
      bankCode,
      accountNumber
    };
  } catch (error) {
    console.error('Bank verification failed:', error.response?.data || error.message);
    return {
      isValid: false,
      error: error.response?.data?.message || 'Bank account verification failed'
    };
  }
}

export default verifyBankDetails;