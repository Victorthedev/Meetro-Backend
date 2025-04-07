const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

class AWSService {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });
  }

  async uploadToS3(file) {
    try {
      const key = `events/${uuidv4()}-${file.originalname}`;

      const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read'
      };

      const result = await this.s3.upload(params).promise();
      return result.Location;
    } catch (error) {
      throw new Error('Failed to upload file to S3');
    }
  }
}

module.exports = new AWSService();