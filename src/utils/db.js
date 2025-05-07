const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const getClient = () => docClient;

const putItem = async (tableName, item) => {
  const command = new PutItemCommand({
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

const updateItem = async (tableName, key, updateExpression, expressionAttributeValues) => {
  const command = new UpdateItemCommand({
    TableName: tableName,
    Key: key,
    UpdateExpression: updateExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  });
  return getClient().send(command);
};

module.exports = { putItem, getItem, queryItems, scanItems, updateItem };