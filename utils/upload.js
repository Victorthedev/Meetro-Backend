const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

exports.handler = async (event) => {
  try {
    const file = event.body;
    const key = `uploads/${uuidv4()}-${file.name}`;

    const params = {
      Bucket: process.env.STORAGE_BUCKET,
      Key: key,
      Body: Buffer.from(file.data, 'binary'),
      ContentType: file.mimetype,
      ACL: 'public-read'
    };

    const result = await s3.upload(params).promise();
    return {
      statusCode: 200,
      body: JSON.stringify({ url: result.Location })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};