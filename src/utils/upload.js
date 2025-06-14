const { S3Client, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const { BUCKET_NAME } = require('./constants');

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const generateUploadUrl = async (uploadType, entityId, fileExtension) => {
  // Validate upload type
  const validTypes = ['profile', 'event', 'event_temp'];
  if (!validTypes.includes(uploadType)) {
    throw new Error(`Invalid upload type. Must be one of: ${validTypes.join(', ')}`);
  }

  // Generate appropriate S3 key
  let key;
  if (uploadType === 'event_temp') {
    key = `events/temp/${uuidv4()}.${fileExtension.toLowerCase()}`;
  } else {
    key = `${uploadType}/${entityId}/${uuidv4()}.${fileExtension.toLowerCase()}`;
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: uploadType === 'profile' 
      ? `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`
      : 'image/*'
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return { url, key };
};

// Add new function to finalize temp uploads
const finalizeEventImage = async (tempKey, eventId) => {
  const newKey = `events/${eventId}/${tempKey.split('/').pop()}`;
  
  await s3Client.send(new CopyObjectCommand({
    Bucket: BUCKET_NAME,
    CopySource: `${BUCKET_NAME}/${tempKey}`,
    Key: newKey
  }));

  await s3Client.send(new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: tempKey
  }));

  return newKey;
};

module.exports = { 
  generateUploadUrl,
  finalizeEventImage
};