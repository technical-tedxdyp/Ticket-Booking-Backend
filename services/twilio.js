import twilio from 'twilio';
const { RestException } = twilio;

const client = twilio(accountSid, authToken);

try {
  const message = await client.messages.create({
    body: 'Hello from Node',
    to: '+12345678901',
    from: '+12345678901',
  });
  console.log(message);
} catch (error) {
  if (error instanceof RestException) {
    console.log(`Twilio Error ${error.code}: ${error.message}`);
    console.log(`Status: ${error.status}`);
    console.log(`More info: ${error.moreInfo}`);
  } else {
    console.error('Other error:', error);
  }
}
