const { putItem, getItem } = require('../../utils/db');
const { TABLE_NAMES } = require('../../utils/constants');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { decode } = require('jsonwebtoken');
// Import DynamoDB dependencies for fallback
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

exports.handler = async (event) => {
  try {
    // Parse input with multiple fallbacks
    const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : event.body || {};
    const { eventId, friendEmails, message, shareMethod } = body;
    
    // Validate required fields
    if (!eventId || !friendEmails || !Array.isArray(friendEmails) || !message || !shareMethod) {
      console.error('Missing required fields', { fields: { eventId, friendEmails, message, shareMethod } });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' }),
      };
    }

    // Validate shareMethod
    if (!['email', 'link'].includes(shareMethod)) {
      console.error('Invalid share method', { shareMethod });
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid share method. Use "email" or "link".' }),
      };
    }

    // Multi-format JWT extraction
    let userId, userName;
    const authContext = event.requestContext?.authorizer;
    
    // Case 1: Standard API Gateway with Cognito
    if (authContext?.jwt?.claims?.sub) {
      userId = authContext.jwt.claims.sub;
      userName = authContext.jwt.claims.given_name;
    } 
    // Case 2: Proxy integration format
    else if (authContext?.claims?.sub) {
      userId = authContext.claims.sub;
      userName = authContext.claims.given_name;
    }
    // Case 3: Fallback to Authorization header
    else if (event.headers?.Authorization) {
      const token = event.headers.Authorization.split(' ')[1];
      const decoded = decode(token);
      userId = decoded?.sub;
      userName = decoded?.given_name;
    }

    // Handle JWT-as-ID case
    if (userId && userId.startsWith('eyJ')) {
      const decoded = decode(userId);
      userId = decoded?.sub;
      userName = decoded?.given_name;
    }

    if (!userId) {
      console.error('Missing user ID in event:', JSON.stringify(event, null, 2));
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid user identity' }),
      };
    }

    // Fetch userName from DynamoDB if not in JWT
    if (!userName) {
      try {
        const user = await getItem(TABLE_NAMES.USERS, { userId: { S: userId } });
        userName = user?.firstName?.S || 'A friend';
      } catch (dbError) {
        console.error('Failed to fetch user name from DynamoDB', { error: dbError.message });
        userName = 'A friend';
      }
    }

    const shareId = uuidv4();
    
    // Generate the event link
    const eventLink = `https://www.meetro.live/event/${eventId}`;

    // Store share details in DynamoDB with fallback
    try {
      await putItem(TABLE_NAMES.SHARES, {
        id: shareId,
        sharedBy: userId,
        eventId,
        friendEmails: friendEmails.map(email => ({ S: email })),
        message,
        shareMethod,
        eventLink,
        createdAt: new Date().toISOString(),
      });
    } catch (putError) {
      if (putError.message.includes('PutCommand is not a constructor')) {
        // Fallback: Use direct DynamoDB client with correct PutCommand
        const client = new DynamoDBClient({ region: process.env.AWS_REGION });
        const docClient = DynamoDBDocumentClient.from(client);
        await docClient.send(new PutCommand({
          TableName: TABLE_NAMES.SHARES,
          Item: {
            id: { S: shareId },
            sharedBy: { S: userId },
            eventId: { S: eventId },
            friendEmails: { L: friendEmails.map(email => ({ S: email })) },
            message: { S: message },
            shareMethod: { S: shareMethod },
            eventLink: { S: eventLink },
            createdAt: { S: new Date().toISOString() },
          },
        }));
      } else {
        throw putError;
      }
    }

    if (shareMethod === 'email') {
      // Send email via Resend with enhanced error handling
      try {
        const emailResponse = await axios.post(
          'https://api.resend.com/emails',
          {
            from: 'Meetro Team <connect@meetro.live>',
            to: friendEmails,
            subject: `${userName} is inviting you to this event`,
            html: `
              <p>${userName} is inviting you to this event: ${message}</p>
              <p><a href="${eventLink}">View the event</a></p>
            `,
            text: `${userName} is inviting you to this event: ${message}\n\nView the event here: ${eventLink}`,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        console.log('Emails sent successfully via Resend', { shareId, userId, eventId, friendEmails, resendId: emailResponse.data.id });
      } catch (emailError) {
        if (emailError.response?.status === 422) {
          console.error('Resend API error', {
            status: 422,
            data: emailError.response?.data,
            friendEmails,
          });
          return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Failed to send email: Invalid email parameters' }),
          };
        }
        throw emailError;
      }
    } else {
      // For 'link' shareMethod, simply return the link
      console.log('Shareable link generated', { shareId, userId, eventId, eventLink });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        shareId,
        message: 'Event shared successfully',
        eventLink: shareMethod === 'link' ? eventLink : undefined,
      }),
    };
  } catch (error) {
    console.error('Create share error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};