const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { PutCommand, GetItemCommand, UpdateItemCommand, QueryCommand, ScanCommand, DeleteItemCommand } = require('@aws-sdk/client-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const getClient = () => docClient;

const putItem = async (tableName, item) => {
  const command = new PutCommand({
    TableName: tableName,
    Item: item,
  });
  return getClient().send(command);
};

const getItem = async (tableName, key) => {
  const command = new GetItemCommand({
    TableName: tableName,
    Key: key,
  });
  const result = await getClient().send(command);
  return result.Item;
};

const queryItems = async (tableName, params) => {
  const command = new QueryCommand({
    TableName: tableName,
    ...params,
  });
  const result = await getClient().send(command);
  return result.Items;
};

const scanItems = async (tableName, params) => {
  const command = new ScanCommand({
    TableName: tableName,
    ...params,
  });
  const result = await getClient().send(command);
  return result.Items;
};

const updateItem = async (tableName, key, updateExpression, expressionAttributeValues, expressionAttributeNames) => {
  const command = new UpdateItemCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ExpressionAttributeNames: expressionAttributeNames,
    ReturnValues: 'ALL_NEW'
  });
  return getClient().send(command);
};

const deleteItem = async (tableName, key) => {
  const command = new DeleteItemCommand({
    TableName: tableName,
    Key: key,
  });
  return getClient().send(command);
};

const upsertUser = async (tableName, userId, userData) => {
  const updateParts = [];
  const attrValues = {};
  const attrNames = {
    '#updatedAt': 'updatedAt'
  };

  Object.entries(userData).forEach(([key, value]) => {
    updateParts.push(`#${key} = :${key}`);
    attrValues[`:${key}`] = value;
    attrNames[`#${key}`] = key;
  });

  attrValues[':updatedAt'] = { S: new Date().toISOString() };

  try {
    return await updateItem(
      tableName,
      { userId: { S: userId } },
      `SET ${updateParts.join(', ')}, #updatedAt = :updatedAt`,
      attrValues,
      attrNames
    );
  } catch (error) {
    if (error.name === 'ValidationException') {
      await getClient().send(new PutCommand({
        TableName: tableName,
        Item: {
          userId: { S: userId },
          ...userData,
          createdAt: { S: new Date().toISOString() },
          updatedAt: { S: new Date().toISOString() }
        }
      }));
    } else {
      throw error;
    }
  }
};

module.exports = { 
  putItem,
  getItem,
  queryItems,
  scanItems,
  updateItem,
  deleteItem,
  upsertUser
};