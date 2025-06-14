const { getItem, updateItem } = require('../../utils/db');
const { TABLE_NAMES, NIGERIAN_STATES } = require('../../utils/constants');

exports.handler = async (event) => {
  try {
    const { eventId, ...updates } = JSON.parse(event.body || '{}');
    if (!eventId || Object.keys(updates).length === 0) {
      console.error('Missing eventId or updates', { fields: { eventId, updates } });
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Missing eventId or updates' }),
      };
    }

    const userId = event.requestContext.authorizer.jwt.claims.sub;
    const event = await getItem(TABLE_NAMES.EVENTS, { id: { S: eventId } });
    if (!event) {
      console.error('Event not found', { eventId });
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Event not found' }),
      };
    }

    if (event.creator.S !== userId) {
      console.error('Unauthorized update', { userId, eventId });
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }

    let editCount = event.editCount ? parseInt(event.editCount.N) : 0;
    if (editCount >= 2) {
      console.error('Edit limit reached', { eventId, editCount });
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'Edit limit of 2 reached' }),
      };
    }

    const updateExpressionParts = [];
    const expressionAttributeValues = {};
    const expressionAttributeNames = {};

    if (updates.title) {
      updateExpressionParts.push('#title = :title');
      expressionAttributeValues[':title'] = { S: updates.title };
      expressionAttributeNames['#title'] = 'title';
    }
    if (updates.description) {
      updateExpressionParts.push('#description = :description');
      expressionAttributeValues[':description'] = { S: updates.description };
      expressionAttributeNames['#description'] = 'description';
    }
    if (updates.date) {
      updateExpressionParts.push('#date = :date');
      expressionAttributeValues[':date'] = { S: updates.date };
      expressionAttributeNames['#date'] = 'date';
    }
    if (updates.location) {
      if (updates.location.state && !NIGERIAN_STATES.includes(updates.location.state)) {
        console.error('Invalid Nigerian state', { state: updates.location.state });
        return {
          statusCode: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },  
          body: JSON.stringify({ error: `Invalid state. Must be one of: ${NIGERIAN_STATES.join(', ')}` }),
        };
      }
      updateExpressionParts.push('#location = :location');
      expressionAttributeValues[':location'] = {
        M: {
          city: { S: updates.location.city || '' },
          state: { S: updates.location.state || event.location.M.state.S },
          country: { S: updates.location.country || '' },
        },
      };
      expressionAttributeNames['#location'] = 'location';
    }
    if (updates.ticketTypes) {
      updateExpressionParts.push('#ticketTypes = :ticketTypes');
      expressionAttributeValues[':ticketTypes'] = { L: updates.ticketTypes.map(t => ({ S: t })) };
      expressionAttributeNames['#ticketTypes'] = 'ticketTypes';
    }
    if (updates.isPrivate !== undefined) {
      updateExpressionParts.push('#isPrivate = :isPrivate');
      expressionAttributeValues[':isPrivate'] = { BOOL: !!updates.isPrivate };
      expressionAttributeNames['#isPrivate'] = 'isPrivate';
    }
    if (updates.chipInAmount) {
      updateExpressionParts.push('#chipInAmount = :chipInAmount');
      expressionAttributeValues[':chipInAmount'] = { N: parseFloat(updates.chipInAmount).toString() };
      expressionAttributeNames['#chipInAmount'] = 'chipInAmount';
    }
    if (updates.category) {
      updateExpressionParts.push('#category = :category');
      expressionAttributeValues[':category'] = { S: updates.category };
      expressionAttributeNames['#category'] = 'category';
    }
    if (updates.imageKey) {
      if (!updates.imageKey.startsWith('events/')) {
        console.error('Invalid imageKey format', { imageKey: updates.imageKey });
        return {
          statusCode: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
          },  
          body: JSON.stringify({ error: 'Invalid imageKey. Must start with "events/"' }),
        };
      }
      updateExpressionParts.push('#imageKey = :imageKey');
      expressionAttributeValues[':imageKey'] = { S: updates.imageKey };
      expressionAttributeNames['#imageKey'] = 'imageKey';
    }

    if (updateExpressionParts.length === 0) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        },  
        body: JSON.stringify({ error: 'No valid fields to update' }),
      };
    }

    const updateExpression = `SET ${updateExpressionParts.join(', ')}, #editCount = if_not_exists(#editCount, :zero) + :one`;
    expressionAttributeValues[':zero'] = { N: '0' };
    expressionAttributeValues[':one'] = { N: '1' };
    expressionAttributeNames['#editCount'] = 'editCount';

    await updateItem(TABLE_NAMES.EVENTS, { id: { S: eventId } }, updateExpression, expressionAttributeValues, expressionAttributeNames);

    console.log('Event updated', { userId, eventId, editCount: editCount + 1 });
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ message: 'Event updated' }),
    };
  } catch (error) {
    console.error('Update event error', { error: error.message, stack: error.stack });
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
      },  
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};