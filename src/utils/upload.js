const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const { BUCKET_NAME } = require('./constants');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const generateUploadUrl = async (fileName) => {
  const key = `profile/${uuidv4()}/${fileName}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return { url, key };
};

const getFile = async (key) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });
  return s3Client.send(command);
};

module.exports = { generateUploadUrl, getFile };