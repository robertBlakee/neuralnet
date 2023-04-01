//const mqtt = require('mqtt')

/***
 * Browser
 * Using MQTT over WebSocket with ws and wss protocols
 * EMQX's ws connection default port is 8083, wss is 8084
 * Note that you need to add a path after the connection address, such as /mqtt
 */
const url = 'ws://broker.hivemq.com:8000/mqtt'


// Create an MQTT client
const options = {
  // Clean session
  clean: true,
  connectTimeout: 4000,
  // Authentication
  clientId: 'Ziomus3000',
  //username: 'emqx_test',
  //password: 'emqx_test',
}


// Connect to broker
const client  = mqtt.connect(url, options)

// Subscribe topic and send messange
client.on('connect', function () {
  console.log('Connected')
  // Subscribe to a topic
  client.subscribe('znaki', function (err) {
    if (!err) {
      // Publish a message to a topic
      client.publish('znaki', 'Nara Zamrażara!')
    }
  })
})


// Receive messages
client.on('message', function (topic, message) {
  // message is Buffer
  console.log(message.toString())
  //client.end()
})



/*
// Receive messages with describe datas
client.on('message', function (topic, payload, packet) {
  // Payload is Buffer
  console.log(`Topic: ${topic}, Message: ${payload.toString()}, QoS: ${packet.qos}`)
})
*/
